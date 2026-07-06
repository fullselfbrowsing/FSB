---
phase: 30-consent-governance-recipe-signature-verification-audit-legal
verified: 2026-06-21T19:40:00Z
status: human_needed
score: 10/10 must-have truth groups verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification. A prior attempt was interrupted by a transient API error before writing the file; no previous VERIFICATION.md or gaps section existed."
human_verification:
  - test: "UAT-30-01 live Consent & Audit control-panel smoke: load unpacked extension, open control panel, navigate to Consent & Audit; confirm per-origin list + pending queue + audit table render; toggle Off/Ask/Auto + mutating toggle and confirm persistence; confirm amber Sensitive badge + disabled Auto on https://mail.google.com; confirm greyed row + red Blocked badge on https://www.chase.com; Grant/Deny a pending request + confirm chrome.action badge updates; Export then Clear the audit log."
    expected: "Section renders in the existing control-panel visual language; mode/mutating changes persist to the consent store across reload; Sensitive (amber, Auto-disabled) and Blocked (red, non-enableable) friction matches FsbServiceDenylist.classify; Grant/Deny mutate the queue + toolbar badge; exported JSON + table carry only the seven redacted columns (no args/tokens/cookies/bodies)."
    why_human: "Rendering the MV3 options page and driving its clicks requires loading the unpacked extension in a real Chrome — cannot run in the headless CI gate. The source-text UI surface (consent-audit-settings-ui 52/0) and the gate-side security boundary (consent-gate 11/0) are automated and GREEN; only the live render/interaction is irreducibly manual. Recorded as human_needed debt in 30-HUMAN-UAT.md, matching the Phase-27/28/29 posture — NOT a fabricated pass, NOT a blocking gap."
  - test: "REVIEW ME-02 UI-Grant flow manual confirmation: in the live control panel, grant a pending request for (a) an ordinary origin, (b) a sensitive origin (https://mail.google.com), and (c) a denylisted origin (https://www.chase.com)."
    expected: "Ordinary origin is granted mode 'auto'; sensitive origin is granted mode 'ask' (NOT 'auto') so the stored state matches the gate's runtime downgrade; denylisted origin refuses the grant with a 'blocked from automation' toast and writes no policy."
    why_human: "The ME-02 fix is verified in source (options.js grantPendingRequest classifies via FsbServiceDenylist.classify before writing; sensitive->ask, denied->refuse) and the options.js text/wiring test stays green, but no executing DOM harness exists for this UI branch. The reviewer flagged it for manual confirmation. Non-blocking — the gate re-checks classify on every invoke regardless of stored state, so a mis-stored mode cannot bypass the security boundary."
---

# Phase 30: Consent Governance + Recipe Signature Verification + Audit + Legal Posture — Verification Report

**Phase Goal:** Wrap invoke in the safety gate the whole "credential-replay" risk hinges on — default-OFF per-origin consent, mutation gating, recipe integrity verification, a no-secrets audit log, and a documented legal posture — before any learning/auto behavior ships.
**Verified:** 2026-06-21T19:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (prior attempt interrupted before writing the file)

## Goal Achievement

This is the credential-replay safety phase. Verification was performed goal-backward against the ACTUAL CODEBASE (not the SUMMARYs): each must-have truth was traced to its enforcing code, the ten targeted Phase-30 tests + eight named regression guards were executed green, and the gate / signature / audit enforcement was independently re-proven via runtime behavioral spot-checks. The security boundary is enforced AT THE GATE (where credential-replay is actually prevented), not merely present as UI.

### Observable Truths

The five ROADMAP Success Criteria are the non-negotiable contract; the per-plan must_haves add detail. Truths are grouped by SC and mapped to the requirement IDs they satisfy.

| #   | Truth (ROADMAP SC + plan must_have)                                                                                                                                     | Status     | Evidence |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| 1   | **SC1 / GOV-01/02/04** Default-OFF per origin at the single chokepoint after ownership; Off/Ask/Auto, Auto per-origin only (no global switch); gate before any dispatch | ✓ VERIFIED | `capability-router.js:443-470` gate runs UNCONDITIONALLY in `invoke` before the tier `switch`/`executeBoundSpec`; `_evaluateConsent:278` mode 'off' (and unknown origin) -> RECIPE_CONSENT_REQUIRED. Spot-check [1] unseen origin -> non-allow RECIPE_CONSENT_REQUIRED. `consent-policy-store.js` envelope has no global enable key. Tests: consent-gate 11/0, consent-policy-store 32/0, consent-chokepoint 7/0 (both front doors one gate), capability-autopilot-parity 10/0 |
| 2   | **SC2 / GOV-03** Mutating (POST/PUT/PATCH/DELETE) requires a SEPARATE elevated per-origin opt-in: read-Auto ≠ write-Auto                                                 | ✓ VERIFIED | `_evaluateConsent:317` mutating + !mutatingAllowed -> RECIPE_CONSENT_MUTATING_REQUIRED (step 5, after sensitive). Spot-checks [4] read-Auto+POST -> mutating, [5] +mutating opt-in -> allow. `consent-policy-store.setOriginMutating` writes only the mutating flag, mode untouched. Tests: consent-mutation-gate 10/0 |
| 3   | **SC3 / SIGN-01/02** Non-bundled recipes Ed25519/JCS-verified after schema-validate, before bind; tamper/unsigned -> RECIPE_SIGNATURE_INVALID; bundled exempt           | ✓ VERIFIED | `capability-interpreter.js:347` schema-validate (sync, returns first) -> `:361` bundled/no-meta exempt short-circuit -> `:365-385` verify hook (step 1b) before `bindRecipeCore`. `capability-signature.js:233` verifyRecipeEnvelope fail-closed (signature-absent/recipe-missing/no-trusted-key). Spot-checks sig1 valid->ok, sig2 tampered->false, sig3 unsigned->false, sig5 bundled->ok. Tests: recipe-signature 13/0, recipe-signature-interpreter-hook 13/0 |
| 4   | **SC4 / GOV-05/06** Append-only audit log: exactly {ts,origin,slug,method,sideEffectClass,consentDecision,outcome,error?}; never secrets; tested redactor               | ✓ VERIFIED | `audit-log.js` strict field-whitelist append path (args/body/headers/cookies/tokens NEVER referenced); origin via redactForLog; `_safeError:133` reduces error.message to a content-free shape marker (HI-02 fix). Every invoke outcome audited (`capability-router.js:468,474,518`). Tests: audit-log 23/0, audit-log-no-secret 18/0 (incl. secret embedded in error.message asserted absent) |
| 5   | **SC5 / GOV-07/08** Control-panel UI for per-origin consent + audit viewer; sensitive-origin friction even under Auto; documented legal/ToS posture + service denylist  | ✓ VERIFIED (source) / human_needed (live render) | UI: `control_panel.html` #consent-audit section; `options.js:224-235` five locked ids + classify badges + onChanged. Sensitive+Auto downgrade enforced AT THE GATE (`_evaluateConsent:301-313`, spot-check [2] -> 'sensitive'/RECIPE_CONSENT_REQUIRED). `docs/LEGAL.md` (Automation Posture, Consent Model, Audit Retention, Service Denylist, Recipe Integrity). `service-denylist.json` conservative banking/gov/email seed; checked BEFORE policy (spot-check [3] -> blocked-first). Tests: consent-audit-settings-ui 52/0, service-denylist 17/0, showcase-privacy-page 53/0. Live render = UAT-30-01 (human_needed debt) |
| 6   | **GOV-07/D-14** A sensitive origin (classify) under stored Auto is downgraded to ask AT THE GATE — Auto NEVER silently executes against a sensitive origin                | ✓ VERIFIED | `_evaluateConsent:301-313` step 4 enforced BEFORE mutation/allow; classify is the single source of truth (not a UI flag). Spot-check [2] sensitive+Auto -> decision 'sensitive' / RECIPE_CONSENT_REQUIRED, no executeBoundSpec. service-denylist.js classify: denied-implies-sensitive + seeded sensitiveOrigins match |
| 7   | **SIGN-01/HI-01** Bundled exemption decided by TRUSTED provenance (loader/source), not payload-asserted — a recipe cannot self-declare 'bundled' to skip verify          | ✓ VERIFIED | `capability-interpreter.js:329,356,381` trusted `opts.trustedProvenance`; payload's own provenance field never forwarded. `capability-signature.js:233,242` verifyRecipeEnvelope(envelope, trustedProvenance) ignores embedded provenance when trusted arg supplied. Spot-check sig4: tampered core relabeled bundled in payload but untrusted -> ok:false (NO BYPASS). Commit c846d8d4 |
| 8   | **GOV-04/INV-02** Gate above executeBoundSpec; two-point origin-pin, INV-01 (frozen hash, no errors.ts edit), INV-04 (iterator byte-untouched) intact                    | ✓ VERIFIED | Gate sits above the tier `switch` (`capability-router.js:455-485`); errors.ts last touched Phase 27 (8d7a4dbd), RECIPE_CONSENT_*/RECIPE_SIGNATURE not hardcoded (passthrough). Tests: capability-mcp-surface 19/0 (INV-01 frozen ~63 schemas), agent-loop-iterator-guard pass (INV-04), capability-router 27/0, capability-interpreter pass, capability-head-handlers pass |
| 9   | **ME-01 fail-closed** When a Phase-30 module is present but the consent store failed to load, the gate FAILS CLOSED (RECIPE_CONSENT_REQUIRED), never fall-open            | ✓ VERIFIED | `_evaluateConsent:249-259` store-absent + `_isPhase29HarnessNoSecurityModules()` false -> RECIPE_CONSENT_REQUIRED ('consent-store-unavailable'); only the pure Phase-29 harness (zero Phase-30 modules) keeps the legacy allow. Commit 56aa00a4 |
| 10  | **Wall-1 recipe-path** All four gate/recipe-path modules eval-free + allowlisted; recipe-path guard green; background.js pre-arms importScripts + denylist load           | ✓ VERIFIED | `verify-recipe-path-guard.mjs` exit 0; allowlist contains capability-signature/consent-policy-store/audit-log/service-denylist (lines 133/139/144/151); zero eval/new Function/import in the four modules. `background.js:204-215` four dependency-ordered importScripts + guarded FsbServiceDenylist.load() at SW startup |

**Score:** 10/10 must-have truth groups verified in the codebase. Truth 5's live-render half is the only outstanding item and is recorded human_needed debt (non-blocking, per the explicit Phase-27/28/29 posture).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `extension/utils/consent-policy-store.js` | Per-origin Off/Ask/Auto + elevated mutating (default-OFF) | ✓ VERIFIED | 268 lines; dual-export; default-OFF getConsentForOrigin; null-proto policies (ME-03 fix cf2e9151); read by gate |
| `extension/utils/audit-log.js` | Append-only secret-free redacted ring | ✓ VERIFIED | 259 lines; field-whitelist; _safeError message-redaction (HI-02 025fb91d); FIFO MAX_ENTRIES 200; called by router on every outcome |
| `extension/utils/capability-signature.js` | Native Ed25519 + in-house JCS + verifyRecipeEnvelope (fail-closed) | ✓ VERIFIED | 328 lines; native feature-detect fail-closed; JCS byte-identical to fixture signer; trusted-provenance gate (HI-01 c846d8d4); wired into interpreter |
| `extension/utils/service-denylist.js` | isDenied + classify (sensitivity source of truth) + load() | ✓ VERIFIED | 242 lines; checked-first; classify feeds gate step 4; load() one-time diagnostic on dual-path failure (LO-03 3be43a97); read by gate + UI |
| `extension/config/service-denylist.json` | { v, deniedOrigins, sensitiveOrigins, deniedReason } conservative seed | ✓ VERIFIED | banking/gov denied (chase/bofa/wellsfargo/irs.gov) + banking/email/*.gov sensitive seed; subdomain-wildcard form |
| `docs/LEGAL.md` | Legal/ToS posture + retention + consent model | ✓ VERIFIED | 132 lines; Automation Posture, Consent Model, Audit Log + Retention + "What is never recorded", Service Denylist, Recipe Integrity |
| `extension/utils/capability-router.js` | invoke wrapped by gate + audit on every outcome | ✓ VERIFIED | gate at single chokepoint, locked decision order, above executeBoundSpec, audit on every return; WIRED to all collaborators |
| `extension/utils/capability-interpreter.js` | Signature hook after schema-validate, before bind | ✓ VERIFIED | hook step 1b; trusted-provenance; RECIPE_SIGNATURE_INVALID; bundled/no-meta sync-exempt (backward-compatible) |
| `extension/ui/control_panel.html` | Consent & Audit section (per-origin, pending, audit table, legal card) | ✓ VERIFIED | #consent-audit section; 5 locked ids; seven redacted columns; legal card; no secret column |
| `extension/ui/options.js` | cacheElements + listeners + render wiring + classify badges | ✓ VERIFIED | 5 ids cached; classify badges; onChanged subscription; grantPendingRequest classify-before-write (ME-02 3a666b8d); export/clear |
| `showcase/.../privacy-page.component.html` | Legal posture cross-link | ✓ VERIFIED | "Legal Posture and Consent Model" section + LEGAL link; fresh i18n markers; privacy regression green (53/0) |
| Fixtures (sign-fixtures.mjs + 3 JSON) | Signed + one-byte-tampered + fixture public key | ✓ VERIFIED | all four present; sig spot-checks confirm sign->pass, tamper->fail, signature byte-identical |
| 10 Phase-30 test files | RED contract -> GREEN | ✓ VERIFIED | all ten exist and pass green (totals below) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `capability-router.js invoke()` | `FsbConsentGate.evaluate` | gate call before tier switch | ✓ WIRED | `:462` await gate.evaluate(...); non-allow returns error verbatim |
| `capability-router.js` | `FsbServiceDenylist.isDenied + classify` | typeof-guarded; isDenied first, classify step 4 | ✓ WIRED | `:227,301` both consumed; degrade-when-absent |
| `capability-router.js` | `FsbAuditLog.append` | append on every outcome | ✓ WIRED | `_audit` called at `:468,474,478,518` |
| `audit-log.js` | `globalThis.redactForLog` | every field redacted | ✓ WIRED | `_redact()` lazy global; origin + message shape-reduced |
| `capability-interpreter.js interpretRecipe` | `FsbCapabilitySignature.verifyRecipeEnvelope` | hook after schema-validate, before bind, non-bundled only | ✓ WIRED | `:381` await with trusted provenance second arg |
| `capability-signature.js verifyEd25519` | `globalThis.crypto.subtle` | native-first feature-detect, fail-closed | ✓ WIRED | `_detectNativeEd25519:144` importKey probe; fail-closed false |
| `service-denylist.js` | `extension/config/service-denylist.json` | load() reads bundled JSON at SW startup | ✓ WIRED | load() via getURL/require; background.js calls it at boot |
| `options.js` | `FsbConsentPolicyStore + FsbAuditLog + FsbServiceDenylist.classify` | render reads stores + classify for badges | ✓ WIRED | render + grant/deny + export/clear writes |
| `options.js` | `chrome.storage.onChanged` | re-render subscription | ✓ WIRED | `:431` addListener |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| consent gate decision | `verdict` | `gate.evaluate` reading real consent envelope (chrome.storage.local) + denylist classify | Yes — spot-checks [1]-[5] drive real envelope reads and produce off/sensitive/mutating/allow per stored state | ✓ FLOWING |
| audit ring | `entries` | router `_audit()` on every invoke outcome -> chrome.storage.local ring | Yes — audit-log tests append + read real persisted entries; router writes on each outcome | ✓ FLOWING |
| signature verdict | `verifyResult.ok` | verifyRecipeEnvelope -> native crypto.subtle Ed25519 over JCS bytes | Yes — sig spot-checks verify the real fixture signature (native crypto), reject the real one-byte tamper | ✓ FLOWING |
| UI consent rows + badges | `classify(origin)` | options.js render reads FsbServiceDenylist.classify (same source the gate enforces) | Yes (source-verified) — render branches on real classify; live paint is UAT-30-01 | ✓ FLOWING (source) |

### Behavioral Spot-Checks

Independently re-proven by loading the real modules and driving the real gate / verifier (the same in-memory chrome.storage.local stub idiom the project tests use).

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Unseen origin default-OFF | `gate.evaluate(unseen, GET)` | decision non-allow, RECIPE_CONSENT_REQUIRED | ✓ PASS |
| Sensitive+Auto downgrade (GOV-07/D-14) | `gate.evaluate(mail.google.com@auto, GET)` | decision 'sensitive', RECIPE_CONSENT_REQUIRED, no executeBoundSpec | ✓ PASS |
| Denylist checked-first (GOV-08) | `gate.evaluate(chase.com, GET)` | decision 'blocked', RECIPE_CONSENT_BLOCKED | ✓ PASS |
| read-Auto + POST -> mutating (GOV-03) | `gate.evaluate(api.foo@read-auto, POST)` | decision 'mutating', RECIPE_CONSENT_MUTATING_REQUIRED | ✓ PASS |
| read-Auto + mutating opt-in -> allow | `gate.evaluate(api.foo@auto+mutating, POST)` | decision 'allow' | ✓ PASS |
| Valid signed fixture verifies (SIGN-01) | `verifyRecipeEnvelope(signed, null)` | ok:true | ✓ PASS |
| One-byte-tampered fixture rejected | `verifyRecipeEnvelope(tampered, null)` | ok:false (signature-invalid) | ✓ PASS |
| Unsigned non-bundled fail-closed | `verifyRecipeEnvelope(unsigned, null)` | ok:false (signature-absent) | ✓ PASS |
| HI-01 payload-claims-bundled but untrusted | `verifyRecipeEnvelope({tampered, provenance:'bundled'}, null)` | ok:false — NO BYPASS | ✓ PASS |
| Trusted bundled exempt | `verifyRecipeEnvelope({...}, 'bundled')` | ok:true | ✓ PASS |

_Note: an initial bare-Node probe of checks [2]/[4] returned 'off' because it lacked the chrome.storage.local stub — `setOriginMode` had nowhere to persist, so the gate correctly stopped at the (fail-closed/safe) default-OFF step. Re-run with the proper in-memory stub the project tests use, both PASS. This is a probe-harness artifact, not a code defect._

### Targeted Test Execution (Phase-30 suite — all green)

| Test | Result | Test | Result |
| ---- | ------ | ---- | ------ |
| consent-policy-store | 32/0 ✓ | recipe-signature | 13/0 ✓ |
| consent-gate | 11/0 ✓ | recipe-signature-interpreter-hook | 13/0 ✓ |
| consent-mutation-gate | 10/0 ✓ | service-denylist | 17/0 ✓ |
| consent-chokepoint | 7/0 ✓ | consent-audit-settings-ui | 52/0 ✓ |
| audit-log | 23/0 ✓ | audit-log-no-secret | 18/0 ✓ |

### Regression Guards (named invariants — all green)

| Guard | Result | Invariant |
| ----- | ------ | --------- |
| verify-recipe-path-guard.mjs | exit 0 ✓ | recipe-path eval-free + allowlisted (Wall-1) |
| capability-mcp-surface | 19/0 ✓ | INV-01 frozen tool-schema hash, no errors.ts edit |
| agent-loop-iterator-guard | pass ✓ | INV-04 iterator byte-untouched |
| capability-router | 27/0 ✓ | Phase-29 dispatch unchanged (gate precedes only) |
| capability-autopilot-parity | 10/0 ✓ | one gate both front doors |
| capability-interpreter | pass ✓ | backward-compatible no-meta path |
| capability-head-handlers | pass ✓ | bundled head exempt, router awaits interpretRecipe |
| showcase-privacy-page | 53/0 ✓ | privacy-page legal cross-link, no regression |
| showcase-build-smoke | 124/0 ✓ | Phase-30 i18n regression fixed (legal markers balanced) |

INV-01 confirmed independently: `mcp/src/errors.ts` last modified in commit 8d7a4dbd (Phase 27, 2026-06-20), and RECIPE_CONSENT_*/RECIPE_SIGNATURE_INVALID are NOT hardcoded there — they surface verbatim via the existing `/^RECIPE_.+$/` passthrough (zero errors.ts edit).

### Requirements Coverage

All 10 declared requirement IDs cross-referenced against REQUIREMENTS.md (each `**REQ**` description matched to verified enforcing code/tests). REQUIREMENTS.md maps exactly these 10 IDs to Phase 30 (no orphans).

| Requirement | Source Plan(s) | Description (REQUIREMENTS.md) | Status | Evidence |
| ----------- | -------------- | ----------------------------- | ------ | -------- |
| GOV-01 | 30-01/02 | Capability execution default-OFF per origin | ✓ SATISFIED | Truth 1; consent-gate, spot-check [1] |
| GOV-02 | 30-01/02 | Off/Ask/Auto, Auto per-origin only, no global switch | ✓ SATISFIED | Truth 1; consent-policy-store 32/0 (no global enable key) |
| GOV-03 | 30-01/02 | Mutating requires elevated consent | ✓ SATISFIED | Truth 2; consent-mutation-gate, spot-checks [4][5] |
| GOV-04 | 30-01/02 | Gate at single chokepoint after ownership | ✓ SATISFIED | Truths 1,8; consent-chokepoint, autopilot-parity |
| GOV-05 | 30-01/02 | Append-only audit log of the seven fields, no secrets | ✓ SATISFIED | Truth 4; audit-log 23/0 |
| GOV-06 | 30-01/02 | Auth material never persisted; tested redactor | ✓ SATISFIED | Truth 4; audit-log-no-secret 18/0 (incl. error.message sentinel) |
| GOV-07 | 30-01/02/03/04 | Control-panel UI + sensitive-origin friction even under Auto | ✓ SATISFIED (gate+source) / human_needed (live render) | Truths 5,6; consent-audit-settings-ui 52/0, consent-gate sensitive case; UAT-30-01 live debt |
| GOV-08 | 30-01/03/04 | Documented legal/ToS posture + service denylist | ✓ SATISFIED | Truth 5; service-denylist 17/0, LEGAL.md, denylist JSON, privacy cross-link |
| SIGN-01 | 30-01/03 | Server recipes Ed25519/JCS-verified; tamper rejected | ✓ SATISFIED | Truths 3,7; recipe-signature 13/0, sig spot-checks |
| SIGN-02 | 30-01/03 | Integrity metadata checked by interpreter before binding | ✓ SATISFIED | Truth 3; recipe-signature-interpreter-hook 13/0 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | TBD/FIXME/XXX debt markers | — | None found in any phase-30-modified source file |
| (none) | — | TODO/HACK/PLACEHOLDER / "coming soon" / "not yet implemented" | — | None found |
| (none) | — | Emoji | — | None found (project rule honored) |
| (none) | — | eval / new Function / import( on recipe path | — | None found — all four modules eval-free (Wall-1 intact, guard green) |

No blocker, warning, or info anti-patterns. Code review (30-REVIEW.md, deep, FORCE stance) found 8 issues (0 blocker, 2 high, 3 medium, 3 low) — ALL RESOLVED and independently re-verified in code here: HI-01 (c846d8d4, no-bypass proven via sig spot-check 4), HI-02 (025fb91d, error.message redaction in _safeError + sentinel test), ME-01 (56aa00a4, store-absent fail-closed), ME-02 (3a666b8d, grant classify-before-write), ME-03 (cf2e9151, null-proto policies), LO-01 (61fed205), LO-02 (folded into 025fb91d), LO-03 (3be43a97). All eight named commit hashes exist in git history.

### Human Verification Required

Two items, both NON-BLOCKING and explicitly recorded as human_needed debt matching the established Phase-27/28/29 posture (the live/manual half of a phase whose CI/source-text + gate-side security boundary is fully automated and green):

1. **UAT-30-01 — Live Consent & Audit control-panel smoke** (30-HUMAN-UAT.md)
   - Test: load the unpacked extension, open the control panel, navigate to Consent & Audit; confirm the per-origin list + pending queue + audit table render; toggle Off/Ask/Auto + mutating and confirm persistence; confirm amber Sensitive badge + disabled Auto on https://mail.google.com; confirm greyed row + red Blocked badge on https://www.chase.com; Grant/Deny a pending request + confirm the chrome.action badge updates; Export then Clear the audit log.
   - Expected: renders in the existing control-panel visual language; mode/mutating persist across reload; Sensitive/Blocked friction matches classify; Grant/Deny mutate queue + badge; exported JSON + table carry only the seven redacted columns.
   - Why human: rendering the MV3 options page and driving its clicks needs a real Chrome — cannot run headless. The source-text UI surface (consent-audit-settings-ui 52/0) and the gate-side enforcement (consent-gate 11/0) ARE automated and green; only the live render/interaction is irreducibly manual.

2. **REVIEW ME-02 — UI-Grant flow manual confirmation** (30-REVIEW.md ME-02)
   - Test: in the live control panel, grant a pending request for an ordinary origin, a sensitive origin (https://mail.google.com), and a denylisted origin (https://www.chase.com).
   - Expected: ordinary -> 'auto'; sensitive -> 'ask' (not 'auto'); denylisted -> grant refused with a "blocked from automation" toast and no policy written.
   - Why human: the fix is source-verified (options.js grantPendingRequest classifies before writing) and the wiring test stays green, but no executing DOM harness exists for this branch. Non-blocking — the gate re-checks classify on every invoke, so a mis-stored mode cannot bypass the boundary.

### Gaps Summary

**No gaps.** Every must-have truth is enforced in the codebase and independently verified: the consent gate wraps `FsbCapabilityRouter.invoke` at the single chokepoint above `executeBoundSpec` with the correct locked decision order (denylist-block -> default-OFF -> ask -> sensitive+Auto downgrade -> mutation-elevation -> allow); the signature verifier is native-Ed25519/in-house-JCS, fail-closed, hooked after schema-validate and before bind, with the HI-01 trusted-provenance seam closed (a payload cannot self-declare bundled to skip verify); the audit ring is structurally secret-free including error.message (HI-02); the denylist is checked-first and is the single source of truth for sensitivity feeding both the gate and the UI; docs/LEGAL.md documents the posture; and the hard invariants (INV-01 frozen schema/no errors.ts edit, INV-04 iterator, origin-pin, Wall-1 recipe-path) are all intact. 10/10 targeted Phase-30 tests + 8 named regression guards run green; the full `npm test` was deliberately NOT run (its chain is confounded by pre-existing working-tree drift in dashboard/showcase/lattice files unrelated to Phase 30 — the targeted tests + named guards are the correct evidence, and the Phase-30-introduced showcase-build-smoke i18n regression is already fixed at 124/0).

The phase goal — wrapping invoke in the safety gate the credential-replay risk hinges on — is achieved. The status is `human_needed` (not `passed`) solely because two live/manual UI items remain outstanding; both are recorded, non-blocking debt consistent with prior phases, and neither is a security boundary (the boundary is the gate, which is automated and green).

---

_Verified: 2026-06-21T19:40:00Z_
_Verifier: Claude (gsd-verifier)_
