---
phase: 30-consent-governance-recipe-signature-verification-audit-legal
plan: 01
subsystem: testing
tags: [consent, ed25519, jcs, rfc8785, audit-log, redaction, service-denylist, recipe-signature, mv3, web-crypto, nyquist, wave-0]

# Dependency graph
requires:
  - phase: 26-recipe-schema-bundled-interpreter
    provides: "validateRecipe closed-vocabulary schema (the fixture recipe core validates against it) + createRecipeError dual-field RECIPE_* helper + RECIPE_PATH_ALLOWLIST guard"
  - phase: 27-authenticated-fetch-primitive
    provides: "MUTATING_METHODS {POST,PUT,PATCH,DELETE} (the mutation-gate side-effect classifier) + the allowlist pre-arm precedent"
  - phase: 29-catalog-tiered-router
    provides: "FsbCapabilityRouter.invoke(slug,args,ctx) -- the single chokepoint the consent gate (Plan 02) will wrap"
provides:
  - "Ten Phase-30 RED test files (GOV-01..08 + SIGN-01/02), all failing-loud until their Wave-1/2 module lands (the Nyquist contract for the security phase)"
  - "A reproducible Ed25519 signing script + a fixture public key + a signed envelope + a one-byte-tampered envelope (signature byte-identical) under catalog/recipes/_fixtures/signature/"
  - "RECIPE_PATH_ALLOWLIST pre-armed with capability-signature.js + consent-policy-store.js + audit-log.js + service-denylist.js (guard stays GREEN, fails closed when modules land)"
  - "background.js pre-armed with 4 guarded importScripts + the denylist load() at SW startup"
  - "All ten tests wired into the package.json scripts.test chain (tail, before the iterator guard)"
  - "LOCKED interface contracts (FsbConsentPolicyStore / FsbAuditLog / FsbConsentGate / FsbCapabilitySignature / FsbServiceDenylist) + the LOCKED signed-payload scope, frozen for Plans 02/03/04 to implement against"
affects: [30-02-consent-store-gate-audit, 30-03-signature-denylist-legal, 30-04-consent-audit-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 RED-first: zero-framework Node tests authored BEFORE the production modules, failing loudly (require throws / spy-count fails / fixture-file-read throws) so later waves turn RED -> GREEN rather than authoring tests after the fact"
    - "Native Web Crypto Ed25519 fixture signer: globalThis.crypto.subtle generate/sign/verify with an in-house RFC-8785 JCS serializer; zero new packages on the recipe path"
    - "Self-proving fixture generator: the signer verifies signed-pass + tampered-fail before emitting, so it never writes a fixture that would not behave as the tests expect"
    - "Allowlist pre-arm + explicit-listing for non-glob gate modules (service-denylist.js read above the interpret path is listed explicitly, Pitfall 6)"

key-files:
  created:
    - "catalog/recipes/_fixtures/signature/sign-fixtures.mjs"
    - "catalog/recipes/_fixtures/signature/fixture-public-key.json"
    - "catalog/recipes/_fixtures/signature/signed-recipe.json"
    - "catalog/recipes/_fixtures/signature/tampered-recipe.json"
    - "tests/consent-policy-store.test.js"
    - "tests/consent-gate.test.js"
    - "tests/consent-mutation-gate.test.js"
    - "tests/consent-chokepoint.test.js"
    - "tests/audit-log.test.js"
    - "tests/audit-log-no-secret.test.js"
    - "tests/recipe-signature.test.js"
    - "tests/recipe-signature-interpreter-hook.test.js"
    - "tests/service-denylist.test.js"
    - "tests/consent-audit-settings-ui.test.js"
  modified:
    - "scripts/verify-recipe-path-guard.mjs"
    - "extension/background.js"
    - "package.json"

key-decisions:
  - "Signed-payload scope LOCKED = recipe core + capturedAt + schemaHash, MINUS the signature field; canonicalized via the in-house JCS serializer (the script embeds a byte-for-byte copy of the Plan 03 runtime logic so signer and verifier agree, RESEARCH Open Question 1 / Pitfall 3)"
  - "Error codes LOCKED in the RECIPE_ family (RECIPE_CONSENT_REQUIRED / RECIPE_CONSENT_BLOCKED / RECIPE_CONSENT_MUTATING_REQUIRED / RECIPE_SIGNATURE_INVALID) so they surface verbatim via the existing /^RECIPE_.+$/ passthrough with ZERO errors.ts edit (RESEARCH Pitfall 4 Option A)"
  - "The GOV-07/D-14 sensitive+Auto control is sampled GATE-SIDE in consent-gate.test.js (classify-sensitive origin under mode 'auto' -> non-allow, decision 'sensitive', RECIPE_CONSENT_REQUIRED) -- enforcement is not UI-only"
  - "service-denylist.js is a DEFINITE allowlist entry (not optional): it does not match the capability-* glob but the gate reads it just above the interpret path (Pitfall 6), so Check 1 must scan it for dynamic-code constructs"
  - "The fixture keypair is non-deterministic per run (Ed25519 keygen is random); the COMMITTED fixtures are canonical and internally consistent (the test injects whatever fixture-public-key.json ships), and the fixture key must NEVER become a production trusted key (T-30-02)"

patterns-established:
  - "Wave-0 RED contract: every module-dependent test fails loudly (no try/catch swallow); a verify spy/counter proves the bundled-exempt branch does not call verify rather than asserting absence by omission; secret substrings are seeded into NON-whitelisted fields so the no-secret test genuinely proves redaction, not green-over-clean-data"
  - "Pre-arm-ahead-of-creation: the allowlist + background.js importScripts register the four modules before Plans 02/03 write them; Check 1 existsSync-skips an absent path, Check 4 fails closed the moment a capability-* one lands"

requirements-completed: [GOV-01, GOV-02, GOV-03, GOV-04, GOV-05, GOV-06, GOV-07, GOV-08, SIGN-01, SIGN-02]

# Metrics
duration: 11min
completed: 2026-06-21
---

# Phase 30 Plan 01: Wave-0 Validation + Safety Scaffold Summary

**Ten failing-loud Phase-30 RED tests (GOV-01..08 + SIGN-01/02) + a self-proving native-Ed25519/JCS fixture signer (signed + one-byte-tampered envelopes) + a four-module RECIPE_PATH_ALLOWLIST/background.js pre-arm, all wired into the npm test chain — the Nyquist contract for the security phase, before any production code.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-21T22:52:48Z
- **Completed:** 2026-06-21T23:03:45Z
- **Tasks:** 3
- **Files modified:** 17 (14 created, 3 modified)

## Accomplishments
- A reproducible Ed25519 fixture signer using native `globalThis.crypto.subtle` + an in-house RFC-8785 JCS serializer (a byte-for-byte copy of the Plan 03 runtime logic), emitting a fixture public key, a `provenance:'server'` signed envelope (recipe core validates against the locked schema), and a one-byte-tampered envelope whose signature is byte-identical so verify must fail. The script self-checks signed-pass + tampered-fail before writing — it can never emit a fixture that misbehaves.
- The ten Phase-30 RED test files encoding GOV-01..08 + SIGN-01/02 against the LOCKED interface names + error codes, every one failing loud today (require throws / spy-count fails / fixture-read throws) so Plans 02/03/04 turn them RED -> GREEN. The consent-gate test samples the GOV-07/D-14 sensitive+Auto downgrade gate-side ('sensitive' / RECIPE_CONSENT_REQUIRED, no side effect).
- `RECIPE_PATH_ALLOWLIST` pre-armed with all four new modules (capability-signature.js auto-covered by the capability-* glob; consent-policy-store.js, audit-log.js, AND service-denylist.js listed explicitly), keeping `node scripts/verify-recipe-path-guard.mjs` GREEN now and failing closed the instant a not-yet-eval-free module lands.
- `background.js` pre-armed with four dependency-ordered try/catch `importScripts` + a guarded `FsbServiceDenylist.load()` at SW startup; all ten tests appended to the `package.json` scripts.test chain at the tail with the iterator guard kept last and no existing entry reordered or removed.

## Task Commits

Each task was committed atomically:

1. **Task 1: fixture-signing script + the three signature fixtures** - `a7fa5106` (test)
2. **Task 2: the ten Phase-30 RED test files** - `2c35b26e` (test)
3. **Task 3: pre-arm allowlist + background.js wiring + package.json test chain** - `83614f0d` (chore)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `catalog/recipes/_fixtures/signature/sign-fixtures.mjs` - reproducible native-Ed25519/in-house-JCS signer; signed-payload scope = recipe core + capturedAt + schemaHash MINUS signature; self-checks before emitting
- `catalog/recipes/_fixtures/signature/fixture-public-key.json` - base64 raw Ed25519 public key (test-only, D-08; NEVER a production trusted key)
- `catalog/recipes/_fixtures/signature/signed-recipe.json` - valid provenance:'server' envelope (recipe core validates against the closed schema)
- `catalog/recipes/_fixtures/signature/tampered-recipe.json` - endpoint flipped /notifications -> /notificationz (one char), signature byte-identical
- `tests/consent-policy-store.test.js` - GOV-02 default-OFF envelope + Off/Ask/Auto round-trip + no-global-enable-key
- `tests/consent-gate.test.js` - GOV-01 default-OFF non-allow + GOV-07/D-14 sensitive+Auto -> 'sensitive' (gate-side)
- `tests/consent-mutation-gate.test.js` - GOV-03 read-Auto != write-Auto (RECIPE_CONSENT_MUTATING_REQUIRED across all four mutating verbs)
- `tests/consent-chokepoint.test.js` - GOV-04 one gate inside invoke, both front-door ctx shapes reach it (spy-based)
- `tests/audit-log.test.js` - GOV-05 field-whitelist entry schema + FIFO MAX_ENTRIES 200 + clear
- `tests/audit-log-no-secret.test.js` - GOV-06 no auth substring survives (secrets seeded in non-whitelisted fields; whole-ring substring == 0)
- `tests/recipe-signature.test.js` - SIGN-01 canary (fixtures + Node crypto exist) sign/verify/tamper + D-07 bundled exemption via verify spy + fail-closed on absent signature + JCS key-sort/integer-tripwire
- `tests/recipe-signature-interpreter-hook.test.js` - SIGN-02 hook AFTER schema-validate BEFORE bind (tampered -> RECIPE_SIGNATURE_INVALID; schema-bad -> schema error; bundled binds without verify)
- `tests/service-denylist.test.js` - GOV-08 denylist JSON shape + classify source-of-truth + checked-first RECIPE_CONSENT_BLOCKED + LEGAL.md retention/consent sections
- `tests/consent-audit-settings-ui.test.js` - GOV-07 full 30-UI-SPEC AC surface (nav/section, per-origin, pending, audit table seven columns, wiring, legal, no-secret-column, no-emoji)
- `scripts/verify-recipe-path-guard.mjs` - RECIPE_PATH_ALLOWLIST += the four Phase-30 modules (capability-signature.js / consent-policy-store.js / audit-log.js / service-denylist.js)
- `extension/background.js` - four guarded importScripts (dependency order) + guarded FsbServiceDenylist.load() at SW startup
- `package.json` - scripts.test += the ten Phase-30 tests (tail, before agent-loop-iterator-guard.test.js)

## Decisions Made
- **Signed-payload scope LOCKED** = recipe core + capturedAt + schemaHash, MINUS signature; in-house JCS canonicalization. The script header names this verbatim and embeds an identical copy of the serializer Plan 03 will ship, so the fixture signer and the runtime verifier agree byte-for-byte (RESEARCH Open Question 1 / Pitfall 3, A3).
- **Error codes in the RECIPE_ family** (RECIPE_CONSENT_REQUIRED / RECIPE_CONSENT_BLOCKED / RECIPE_CONSENT_MUTATING_REQUIRED / RECIPE_SIGNATURE_INVALID) so they surface verbatim with zero errors.ts edit (RESEARCH Pitfall 4 Option A; D-03/D-06).
- **GOV-07/D-14 enforcement is sampled gate-side** (not UI-only): consent-gate.test.js drives a classify-sensitive origin under mode 'auto' and asserts a non-allow 'sensitive' decision with no executeBoundSpec — the D-14 control is RED until Plan 02 wires step 4.
- **service-denylist.js is a definite (not optional) allowlist entry** — it is read by the gate just above the interpret path and does not match the capability-* glob, so it is listed explicitly (Pitfall 6).
- **The recipe-signature test injects whatever fixture-public-key.json ships** into TRUSTED_PUBLIC_KEYS, so the signed/tampered/pubkey trio is internally consistent regardless of when the (non-deterministic) keypair was generated; the committed fixtures are canonical.

## Deviations from Plan

None - plan executed exactly as written. No bugs, missing functionality, or blocking issues were encountered (Rules 1-3 did not fire); no architectural decisions arose (Rule 4 did not fire). The plan installs zero packages (native Web Crypto + in-house JCS, T-30-SC), so no package-legitimacy checkpoint was triggered.

## Issues Encountered
- **Fixture regeneration is non-deterministic by design.** Re-running `sign-fixtures.mjs` (as the V1 verification step does) rotates the Ed25519 keypair, dirtying the three committed fixtures. Resolved by restoring the committed fixtures with a per-file `git checkout -- <file>` (the sanctioned single-file restore — never a blanket reset/clean inside the worktree). This is correct: a fixture key must never be a stable/production key (T-30-02), and the signed/tampered/pubkey trio stays internally consistent because the test injects the shipped key. The committed fixtures are the canonical artifacts.

## Known Stubs
None. This wave authors tests + fixtures + pre-arm wiring only; no production module is stubbed. The ten tests are RED-by-design (their target modules/markup do not exist yet) and are documented as the intended Wave-0 state — they are the contract Plans 02/03/04 implement against, not stubs to be wired here. The `service-denylist.test.js` assertion that `docs/LEGAL.md` and `extension/config/service-denylist.json` exist is RED until Plan 03 creates them (expected).

## Self-Check: PASSED
- All 14 created files exist on disk (verified via test -f).
- All three task commits exist: a7fa5106, 2c35b26e, 83614f0d (verified via git log).
- recipe-path guard GREEN (exit 0, 17 recipe-path files, four new modules existsSync-skipped while absent); iterator guard, capability-interpreter, and recipe-path-guard.test.js all stay GREEN (no regression).
- All ten Phase-30 tests RED (exit 1) today — the intended Wave-0 state.

## Next Phase Readiness
- **Plan 02** (consent store + gate + audit ring) turns GREEN: consent-policy-store.test.js, consent-gate.test.js (incl. the sensitive+Auto step-4 downgrade), consent-mutation-gate.test.js, consent-chokepoint.test.js, audit-log.test.js, audit-log-no-secret.test.js — implementing to the LOCKED FsbConsentPolicyStore / FsbAuditLog / FsbConsentGate surfaces, wrapping FsbCapabilityRouter.invoke after ownership, and surfacing RECIPE_CONSENT_* verbatim.
- **Plan 03** (signature + denylist + LEGAL) turns GREEN: recipe-signature.test.js (the canary — flips the instant capability-signature.js lands with the LOCKED jcsCanonicalize / verifyRecipeEnvelope / TRUSTED_PUBLIC_KEYS and the identical signed-payload scope), recipe-signature-interpreter-hook.test.js (the AFTER-schema/BEFORE-bind hook), service-denylist.test.js (the JSON seed + classify + checked-first BLOCKED + docs/LEGAL.md).
- **Plan 04** (UI) turns consent-audit-settings-ui.test.js GREEN by adding the Consent & Audit section per 30-UI-SPEC.md exact-string AC.
- No blockers. The two-point origin-pin, INV-01/02/04, and the no-network charter are untouched (this wave adds no runtime behavior; the importScripts are guarded and the four modules are still absent).

---
*Phase: 30-consent-governance-recipe-signature-verification-audit-legal*
*Completed: 2026-06-21*
