---
phase: 30-consent-governance-recipe-signature-verification-audit-legal
reviewed: 2026-06-21T00:00:00Z
depth: deep
files_reviewed: 22
files_reviewed_list:
  - extension/utils/capability-signature.js
  - extension/utils/consent-policy-store.js
  - extension/utils/audit-log.js
  - extension/utils/service-denylist.js
  - extension/config/service-denylist.json
  - extension/utils/capability-router.js
  - extension/utils/capability-interpreter.js
  - extension/background.js
  - scripts/verify-recipe-path-guard.mjs
  - package.json
  - extension/ui/options.js
  - extension/ui/control_panel.html
  - docs/LEGAL.md
  - showcase/angular/src/app/pages/privacy/privacy-page.component.html
  - showcase/angular/src/locale/messages.xlf
  - showcase/angular/src/locale/messages.de.xlf
  - catalog/recipes/_fixtures/signature/sign-fixtures.mjs
  - catalog/recipes/_fixtures/signature/signed-recipe.json
  - catalog/recipes/_fixtures/signature/tampered-recipe.json
  - catalog/recipes/_fixtures/signature/fixture-public-key.json
  - tests/audit-log-no-secret.test.js
  - tests/recipe-signature.test.js
findings:
  blocker: 0
  high: 2
  medium: 3
  low: 3
  total: 8
status: resolved
resolved_at: 2026-06-21
resolution: all 8 findings fixed via /gsd:code-review --fix (HI-01 c846d8d4, HI-02 025fb91d, ME-01 56aa00a4, ME-02 3a666b8d, ME-03 cf2e9151, LO-01 61fed205, LO-03 3be43a97; LO-02 folded into HI-02 025fb91d).
---

# Phase 30: Code Review Report

**Reviewed:** 2026-06-21
**Depth:** deep (cross-file: router gate -> interpreter hook -> signature verifier -> catalog recipe source; consent store + audit ring + denylist normalization)
**Files Reviewed:** 22 source files (the 4 new security modules, the 2 modified gate modules, wiring, UI, legal, i18n, fixtures, and the 10 tests)
**Status:** issues_found

## Summary

This is the credential-replay safety phase, reviewed with FORCE adversarial stance and runtime probing (not read-only). The headline mechanisms are SOUND:

- **Signature fail-closed is correct.** Probed with a `crypto.subtle` that exposes `verify()` returning `true` but no native Ed25519 (`importKey` rejects): the valid envelope still returns `{ok:false}` and `subtle.verify` is NEVER reached. (My first probe appeared to show a bypass; it was a Node v25 harness artifact -- `globalThis.crypto` is a read-only getter, so the mock silently did not install and the REAL native crypto verified the real fixture. Re-tested with `Object.defineProperty` override: genuinely fail-closed.)
- **JCS serializer is byte-identical** to the fixture signer (`sign-fixtures.mjs`); native path accepts the signed fixture and rejects the one-byte-tampered fixture.
- **Consent gate ordering is correct and complete** (denylist-block -> default-OFF -> Ask -> sensitive+Auto downgrade -> mutation-elevation -> allow), the gate is the single UNCONDITIONAL chokepoint (no early-return precedes it in `invoke`), it sits ABOVE `executeBoundSpec`, and both front-door ctx shapes hit the one gate.
- **Denylist normalization resists cosmetic bypass** (case / port / trailing-slash / subdomain-confusion all behave correctly; `chase.com.evil.com` is NOT denied, `sub.chase.com` IS).
- **Audit ring is structurally secret-free** for every router-reachable code path, prototype-pollution-safe, no double-count; the UI renders only the 7 whitelisted columns via `textContent`.
- INV preserved: `mcp/src/errors.ts` untouched, all 8 capability modules eval-free and on the recipe-path allowlist (guard passes), i18n well-formed across all 6 locales with matching placeholder counts.

All 10 Phase-30 test files pass (24+23+17+15+13+10+9+8+7 assertions etc.). The defects below are real but do NOT break the current gate; the two HIGH items are latent (one is a contract violation not reachable via the router today; one is a trust-boundary gap that only becomes exploitable when Phase 31 wires non-bundled recipe sources). They are flagged now because this phase ships the security boundary and pre-positions the exact seam the gap sits on.

## High

### HI-01: `bundled` provenance exemption is self-asserted by the untrusted recipe payload (signature-verify bypass seam)

**Status:** RESOLVED (commit c846d8d4). `interpretRecipe` now takes provenance as a TRUSTED `opts.trustedProvenance` argument from the call path; `detectRecipeEnvelope` no longer reads the payload's `provenance` for trust, and `verifyRecipeEnvelope` decides the bundled exemption from the trusted second argument. A payload self-asserting `provenance:'bundled'` can no longer skip verification (regression test added: a tampered core relabeled bundled is still rejected; a correctly-signed self-bundled envelope is still verified).

**File:** `extension/utils/capability-interpreter.js:280-291, 319-325` and `extension/utils/capability-signature.js:228-230`
**Issue:** `detectRecipeEnvelope` reads the `provenance` field directly out of the input object, and `interpretRecipe` short-circuits to the no-verify bind path whenever `envelope.provenance === 'bundled'` (mirrored in `verifyRecipeEnvelope`, which returns `{ok:true}` for `provenance:'bundled'` before any verify call). The trust decision therefore comes from a field INSIDE the recipe payload, not from the channel the recipe was loaded over. Confirmed by probe: an envelope built from the TAMPERED fixture core but relabeled `provenance:'bundled'` binds successfully with `verifyEd25519` call count 0 -- the signature gate is skipped entirely.

This is not exploitable in Phase 30 because the router only ever passes BARE recipe cores from the bundled catalog (`_runDeclarativeTier` -> `entry.recipe` / `getRecipeBySlug`, never a provenance envelope), so no untrusted provenance source exists yet. But Phase 30 explicitly pre-positions this verifier for the Phase-31 server/learned-recipe path, and the focus brief calls out exactly this question ("can a server/learned recipe masquerade as bundled to skip verify?"). The answer is structurally YES.

**Fix:** Provenance must be assigned by the loader from the recipe's SOURCE (bundled-on-disk vs server vs learned), never trusted from a field in the recipe data. When Phase 31 wires non-bundled sources, have the loader stamp `provenance` and have `interpretRecipe` accept provenance as a SEPARATE trusted argument (or only honor `bundled` when the recipe came from the on-disk bundle), e.g.:
```js
// loader (trusted): provenance is derived from WHERE the recipe came from
function loadServerRecipe(raw) {
  return { recipe: raw, provenance: 'server', signature: raw.__sig, ... }; // never raw.provenance
}
// interpreter: only the bundled-on-disk loader may claim 'bundled'
interpretRecipe(core, args, { provenance: trustedProvenance })  // not read from the payload
```
At minimum, add a regression test now asserting that a non-bundled core relabeled `bundled` is still rejected, so the Phase-31 wiring cannot silently inherit this hole.

### HI-02: audit `_safeError` persists `error.message` verbatim -- a secret in a message string survives the "secret-free" ring

**Status:** RESOLVED (commit 025fb91d). `_safeError` now reduces the free-form message to a content-free shape via `redactForLog` (or a `text(len:N)` fallback), whitelisting only a benign `RECIPE_*` control-plane code token; the error NAME is kept. LO-02 folded in: an empty error now returns the stable `'error'` sentinel instead of `''`. `audit-log-no-secret.test.js` extended with a sentinel secret embedded IN `error.message` (`access_token=SECRETLEAK123`) asserted absent, plus an assertion the benign error name survives.

**File:** `extension/utils/audit-log.js:98-113`
**Issue:** The module's contract (docstring lines 23-31, 67-80; LEGAL.md "What is never recorded") is that the audit ring is secret-free and "every recorded field additionally passes through a shape-only redactor." `_safeError` does NOT honor that for the message: it reads `error.message`, `String()`-coerces it, and stores it as `name + ': ' + message` with NO content redaction. Confirmed by probe -- an error `{ name:'FetchError', message:'failed to fetch https://api.x.com/u?access_token=SECRETLEAK123' }` persists as `"FetchError: failed to fetch https://api.x.com/u?access_token=SECRETLEAK123"`; the sentinel survives in `JSON.stringify(getEntries())`.

The router never feeds a raw error object to `_audit` (it passes only RECIPE_* code strings: `gErr.code` / `out.code` at `capability-router.js:437,443,447,487`), so this is NOT reachable through the current gate. But `append` is a public module export, the docstring overstates the guarantee, and any future or alternate caller passing a real `Error` (a fetch failure, an interpreter throw) would leak credential material embedded in the message. For a module whose entire reason to exist is "secret-free," the contract is violated.

**Fix:** Redact the message content, not just the field name. Either pass the message through the existing shape-only redactor, or cap/strip it to a non-content marker. The name is already a benign control-plane value; only the message is risky:
```js
function _safeError(error) {
  if (error === null || error === undefined) return undefined;
  var name = (error && typeof error.name === 'string') ? error.name : '';
  // message may carry a URL/query/token -> reduce to a shape, never the raw text
  var redact = _redact();
  var msg = '';
  if (typeof error === 'string') { msg = redact ? JSON.stringify(redact(error)) : ('len:' + error.length); }
  else if (error && typeof error.message === 'string') {
    msg = redact ? JSON.stringify(redact(error.message)) : ('len:' + error.message.length);
  }
  return name ? (name + ' ' + msg) : msg;
}
```
Also tighten the `audit-log-no-secret.test.js` seed: it puts secrets in the error's SIBLING fields (caught structurally) but the error `message` itself is the benign `'failed'`, so the test would not catch this leak. Add a case with a secret IN `error.message`.

## Medium

### ME-01: combined absence of consent store AND denylist fails OPEN (no gate at all)

**Status:** RESOLVED (commit 56aa00a4). The "store absent => allow" escape hatch now fires ONLY for the genuine Phase-29 harness, detected by the TOTAL absence of all four Phase-30 security modules (signature/audit/denylist/consent store). When ANY of the four is present (a Phase-30 deployment) but the consent store is missing, the gate FAILS CLOSED with `RECIPE_CONSENT_REQUIRED` instead of allowing. Regression test added to `consent-gate.test.js` (store deleted, denylist present -> non-allow). Phase-29 router/autopilot/head/mcp-surface harnesses (no Phase-30 modules) still pass on the preserved allow path.

**File:** `extension/utils/capability-router.js:224-228` (and `207-222`)
**Issue:** When `_consentStore()` returns null (module not loaded), `_evaluateConsent` returns `{decision:'allow'}` to preserve the Phase-29 head's "no consent yet" contract. The denylist check (step 1) runs before this, but if the denylist module is ALSO absent, a denied origin is neither blocked (no denylist) nor consent-gated (store-absent -> allow). The result is an unguarded credentialed invoke. In production both modules are importScripts'd at boot (`background.js`), and a `try/catch` per import means a single module's load failure (e.g. a syntax error introduced later, or an OOM at SW boot) silently downgrades the gate to fully open while the other modules load fine. The degradation is logged only as a `console.error` at import time.

**Fix:** This is a deliberate degrade-vs-Phase-29 tradeoff, but the fail-OPEN direction is the wrong default for a credential-replay gate. Consider: once ANY Phase-30 module is present (signature/audit/denylist/store all ship together), treat a MISSING consent store as fail-CLOSED (RECIPE_CONSENT_REQUIRED) rather than allow -- the "store absent => allow" escape hatch only needs to exist for the pure Phase-29 unit harness, which can be detected by the total absence of all four globals. At minimum, surface the per-module load failure beyond a console.error (a persistent diagnostic) so a silently-degraded gate is observable.

### ME-02: `grantPendingRequest` writes `auto` for a sensitive origin, contradicting the gate's own downgrade

**Status:** RESOLVED (commit 3a666b8d). `grantPendingRequest` now classifies the origin via `FsbServiceDenylist.classify` before writing: a DENIED origin refuses the grant (toast "blocked from automation"), a SENSITIVE origin is granted `'ask'` (not `'auto'`) so the stored mode matches the gate's runtime downgrade, and the elevated mutating opt-in is only written when the origin actually lands on Auto. (UI-layer flow change; verified via the options.js text/wiring test which stays green and a syntax parse -- no executing DOM harness exists for this branch, so flagged for human verification.)

**File:** `extension/ui/options.js` (`grantPendingRequest`, the `store.setOriginMode(origin, 'auto')` line)
**Issue:** Grant unconditionally writes mode `'auto'` (and, for a mutating scope, `setOriginMutating(true)`) without consulting `FsbServiceDenylist.classify(origin)`. For a sensitive origin the gate will (correctly) keep downgrading Auto->Ask at runtime, so this is not a security hole -- but it persists a stored state (`mode:'auto'`) that the gate will never honor, and the per-origin list separately DISABLES the Auto segment for sensitive origins (`renderConsentOriginList`). The UI thus lets Grant set a mode the same UI forbids selecting manually, and stores a misleading "Auto" the user can see but that never takes effect. For a DENYLISTED origin, Grant would even write `auto` to a non-enableable origin (the gate still blocks, but the stored policy is now dishonest).

**Fix:** Before writing, classify the origin; for `denied` refuse the grant outright (toast "blocked"), and for `sensitive` grant `'ask'` (not `'auto'`) so the stored state matches what the gate will actually do:
```js
const cls = denylist && denylist.classify ? denylist.classify(origin) : { denied:false, sensitive:false };
if (cls.denied) { showToast('This origin is blocked from automation', 'error'); return; }
const grantMode = cls.sensitive ? 'ask' : 'auto';
```

### ME-03: `setOriginMode('__proto__', ...)` silently drops the record (data integrity)

**Status:** RESOLVED (commit cf2e9151). The consent policies map is now built on a null prototype (`Object.create(null)`) in `_defaultEnvelope`/`readPolicies` (via `_toNullProtoPolicies`) and in both setters, matching the `capability-interpreter.js:200` idiom. A `__proto__`/`constructor`/`prototype` origin key now round-trips as plain own data (record no longer vanishes) with no Object.prototype pollution; legitimate https origins coexist with no data loss. Regression test added covering all three dangerous keys + a pollution check.

**File:** `extension/utils/consent-policy-store.js:162, 184` (`policies[origin] = {...}`)
**Issue:** Probed for prototype pollution -- the store is SAFE (`getConsentForOrigin` uses `hasOwnProperty.call`, so no `Object.prototype` pollution occurs). However, assigning `policies['__proto__'] = {mode,...}` on a normal object sets the prototype rather than an own key, so after a `readPolicies` round-trip the `__proto__` origin record VANISHES (probe: after `setOriginMode('__proto__','auto')` the persisted `policies` own-keys list does not contain `__proto__`). These are not real origins (origins are `https://...`), so impact is nil today, but the interpreter already adopted the `Object.create(null)` null-prototype idiom for exactly this round-trip-drop class of bug (`capability-interpreter.js:200`). The consent store should match.

**Fix:** Build the policies map on a null prototype (`Object.create(null)`) in `readPolicies`/`_writeEnvelope`, or guard the origin key against `__proto__`/`constructor`/`prototype` in `setOriginMode`/`setOriginMutating` (reject as a no-op, consistent with the existing degrade-never-throw posture).

## Low

### LO-01: audit `outcome` vocabulary mismatch between writer and the no-secret test

**Status:** RESOLVED (commit 61fed205). The audit test seeds in `audit-log.test.js` and `audit-log-no-secret.test.js` now use the writer's real vocabulary (`'ok'`/`'error'`) instead of `'success'`, so the persistence path is exercised with values the production gate actually emits.

**File:** `extension/utils/capability-router.js:437,487` vs `tests/audit-log-no-secret.test.js:82,90` / `tests/audit-log.test.js:88`
**Issue:** The router writes `outcome` values `'blocked'` / `'ok'` / `'error'`, but the audit tests seed `outcome:'success'`. The UI tint regex (`options.js`: `/fail|error|block|deny|denied/i`) matches `'blocked'`/`'error'` but NOT `'success'` or `'ok'` (fine -- those are non-error). No functional bug, but the test fixtures use a value the production writer never emits, so the tests do not exercise the real outcome strings. Cosmetic / test-fidelity.
**Fix:** Align the test seeds to the writer's vocabulary (`'ok'`/`'error'`/`'blocked'`) so the rendered/tinted path is exercised with real values.

### LO-02: `_safeError` returns a bare `''` for an empty error object, recording an indistinguishable "error happened" marker

**Status:** RESOLVED (folded into HI-02, commit 025fb91d). `_safeError` now returns the stable `'error'` sentinel when an error is present but yields no name and no usable message shape, so the presence is unambiguous versus "no error".

**File:** `extension/utils/audit-log.js:108-112`
**Issue:** When an error object has neither `name` nor `message` (e.g. `append({..., error:{}})`), `_safeError` returns `String('')` = `''`, and `append` then sets `safe.error = ''`. A consumer sees an `error` key present but empty -- ambiguous with "no error" except by key presence. Minor.
**Fix:** Return a stable sentinel (e.g. `'error'`) when an error is present but yields no name/message, so the presence is unambiguous.

### LO-03: denylist `load()` Node-path `require('../config/service-denylist.json')` is brittle to bundling

**Status:** RESOLVED (commit 3be43a97). Applied the reviewer's optional suggestion: `load()` now emits a one-time diagnostic (via `rateLimitedWarn`, falling back to `console.warn`) when BOTH the fetch and require config paths fail, so a vanished/relocated `service-denylist.json` is observable rather than silently degrading to an empty (fail-open-for-denylist) set. The default-OFF backstop is unchanged; the module stays eval-free and on the recipe-path allowlist (guard still passes).

**File:** `extension/utils/service-denylist.js:184-193`
**Issue:** The Node/test fallback `require('../config/service-denylist.json')` resolves relative to the module file. This works under the Node test harness and is correctly guarded (degrade-to-empty on throw), but the path assumption (`../config/...`) is implicit and would break silently (degrade to an EMPTY denylist = nothing denied) if the file moves or the module is relocated. An empty denylist is a fail-OPEN for the denylist specifically (the per-origin default-OFF still holds, so not a gate bypass), but a silent "denylist disappeared" is worth a louder signal than a swallowed catch.
**Fix:** Acceptable as-is given the default-OFF backstop; optionally log a one-time diagnostic when BOTH the fetch and require paths fail so a vanished denylist config is observable rather than silently empty.

---

_Reviewed: 2026-06-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
