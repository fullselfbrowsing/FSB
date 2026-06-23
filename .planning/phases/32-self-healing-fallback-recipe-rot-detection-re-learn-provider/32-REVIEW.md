---
phase: 32-self-healing-fallback-recipe-rot-detection-re-learn-provider
reviewed: 2026-06-23T00:00:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - extension/utils/capability-rot-detector.js
  - extension/utils/capability-router.js
  - extension/utils/capability-catalog.js
  - extension/utils/capability-recipe-schema.js
  - extension/utils/capability-interpreter.js
  - extension/utils/recipe-synthesizer.js
  - extension/ai/agent-loop.js
  - extension/background.js
  - scripts/verify-recipe-path-guard.mjs
  - package.json
  - catalog/recipes/_fixtures/valid-recipe-v2.json
findings:
  blocker: 0
  high: 0
  medium: 2
  low: 3
  total: 5
status: resolved
resolution_note: "WR-01 + WR-02 + IN-01 fixed (commits fix(32): WR-01/WR-02/IN-01); IN-02 + IN-03 confirmed intentional fail-safe (no change). Targeted Phase-32 gate + full npm test green post-fix."
---

# Phase 32: Code Review Report

**Reviewed:** 2026-06-23
**Depth:** deep (cross-file: router -> rot-detector -> fetch -> interpreter -> catalog -> discovery-session, plus schema backward-compat and the 7-provider parity boundary)
**Files Reviewed:** 11 source files (the Phase-32 NEW + MODIFIED set; pre-existing unrelated drift in showcase/dashboard/lattice-host/ws-client excluded per scope)
**Status:** issues (no blocker/high; 2 medium robustness gaps + 3 low)

## Summary

Phase 32 is the milestone-closing self-healing layer: a new pure rot classifier, a post-`executeBoundSpec` classify hook on both router tiers, session-only bundled quarantine, a consent-gated re-learn trigger, and an additive schema v1->v2 bump. The taxonomy correctness and the invariant preservation were the priority, and both hold.

**Every HIGH-priority invariant was verified against the running code, not just read:**

- **Taxonomy (HIGH):** `classifyRecipeBroken` branch order is correct and load-bearing. A legitimate no-results (200 + valid shape + empty-but-present container) classifies NOT broken and is returned verbatim; a logged-out redirect surfaces `RECIPE_LOGGED_OUT` (NOT healed); a typed `RECIPE_*` security failure short-circuits as typed-passthrough BEFORE the generic `success:false` branch. The inverse bug was specifically hunted: an empty array / empty object under `expectedShape` PASSES (`resolved !== null && resolved !== undefined`), so a real 0-results outcome is never misclassified as broken. Confirmed by `tests/capability-rot-detector.test.js` (21/21) and by manual trace of the present-predicate.
- **INV-04 (HIGH):** Only `buildSystemPrompt` line 731 changed (single-line diff hunk `@@ -731 +731 @@`). The 4 setTimeout-chained iterator callsites are byte-identical; `tests/agent-loop-iterator-guard.test.js` (4/4) confirms exactly 4 schedules remain byte-unchanged.
- **Schema backward-compat (HIGH):** `schemaVersion` is `enum: [1, 2]` (NOT `const: 2`). Verified empirically: a `schemaVersion:1` recipe with no new fields validates; the new `capturedAt`/`expectedShape` are optional; `additionalProperties:false` still rejects unknown fields; out-of-enum versions (0, 3) and a missing version are still rejected `RECIPE_SCHEMA_INVALID`. The frozen v2 schema hash matches the live schema (`tests/recipe-schema-lock.test.js` 3/3 green).
- **Fallback security (HIGH):** The consent gate sits at the `invoke()` chokepoint BEFORE any tier dispatch (router:594-603), so the classify hook inside the tier bodies is reached only after consent passes. The DOM fallback is a typed reason only -- no parallel executor (INV-02), no `executeTool` call, no pin/consent bypass; the model selects DOM tools next iteration and inherits the same gate. No response body leaks: the emit carries only `slug`/`reason` (a constant code)/`recipeBrokenReason` (a status-only string)/`fellBackToDom`; the rot-detector logs nothing (`result.data` is passed to the jmespath engine for shape eval only). Re-learn is genuinely consent-gated -- `discovery.runDiscovery` -> `capture.startSession` runs the consent gate before any debugger attach.
- **Quarantine correctness (HIGH):** Learned-first resolve returns the T2 hit BEFORE the bundled-quarantine skip, so a fresh re-learned recipe is never demoted; a quarantined bundled slug returns `null` (outranks nothing -> DOM fallback); the REGISTRY object is never mutated (session-only null-proto Set).
- **INV preservation:** INV-01 frozen tool registry hash unmoved + new schema-lock freeze green; INV-02 one engine; INV-03 fallback reason byte-equal across all 7 providers (`tests/provider-parity.test.js` 31/31); rot-detector is eval-free with zero dynamic-module-load constructs and is on the recipe-path allowlist (guard green, 20 files clean). `RECIPE_*` codes ride the `/^RECIPE_.+$/` passthrough with no `errors.ts` edit.

All Phase-32 test suites pass locally: rot-detector 21/21, provider-parity 31/31, schema-lock 3/3, router 38/38, autopilot-parity 13/13, recipe-schema 46/46, synthesizer 21/21, interpreter 51/51, recipe-path-guard PASS.

The two medium findings are real robustness gaps in the conservative degrade, not correctness regressions; they are recorded so the residual masking-as-success edge is tracked.

## Warnings

### WR-01 (medium) [RESOLVED]: Synthesized `expectedShape:'@'` + a 200 login-HTML/error body is returned as a false success (masking-as-success, not masking-as-rot)

**Resolution:** `extension/utils/capability-rot-detector.js` -- added a structure-only auth-wall sniff (`_looksLikeHtmlDocument`) wired into `classifyRecipeBroken` step 5a: a JSON-API recipe (any recipe that declares an `expectedShape`, INCLUDING the weakest `'@'` every synthesized learned recipe carries) whose `result.data` is an HTML-document STRING now classifies broken -> `RECIPE_EXPIRED`, so the DOM fallback fires instead of surfacing the login page as success. The sniff reads only `typeof data === 'string'` + a leading `<` / `<!doctype` / `<html` marker (never a value), staying within D-06. A real JSON object/array (incl. empty) is never a raw HTML string, so the load-bearing never-mask invariant holds (a genuine 0-results outcome still passes). The synthesizer's stamped `expectedShape:'@'` is intentionally left unchanged: a too-strict JMESPath (the only synthesizer-side alternative, since it has redacted shape-only capture and no body) risks the D-06 false-positive the rot-detector backstop avoids; the synthesizer-only `expectedShape` value is NOT part of the frozen schema hash. Regression coverage added to `tests/capability-rot-detector.test.js` (28/28): 200 login-HTML + `<!DOCTYPE html>` shell under `'@'` -> broken; real/empty JSON object+array and a non-HTML string under `'@'` -> NOT broken. The residual JSON-error-envelope edge (`{"error":"unauthorized"}`) is NOT closeable without reading a value (D-06 forbids) and remains the documented conservative degrade. Commit: see `fix(32): WR-01`.

**File:** `extension/utils/recipe-synthesizer.js:295` (stamps `expectedShape:'@'`); interacts with `extension/utils/capability-rot-detector.js:94-119` and `extension/utils/capability-fetch.js:189`

**Issue:** The phase invariant ("never mask a real outcome") is upheld in the direction that matters most -- a real no-results is never healed away. But the converse direction has a real gap for **synthesized learned recipes**. The synthesizer can only derive `expectedShape:'@'` (whole-response identity) because it never sees a body. When a session expires and the server returns **HTTP 200 with a login/HTML or `{"error":"unauthorized"}` JSON body and no 3xx redirect** (common for SPA/JSON endpoints that 200 their auth wall), `classifyRecipeBroken` runs: `success:true`, `redirected:false`, `status:200`, then `validateExpectedShape(data, '@')` -> `search(data, '@')` returns the whole body (non-null) -> shape passes -> verdict NOT broken -> the login page / error envelope is returned VERBATIM as a successful capability result. This does not mask a real no-result (the documented load-bearing invariant), but it does surface a rotted/logged-out response as success for the `'@'` case, which is the weakest assertion and the one every synthesized recipe carries. The module's own D-06 comment acknowledges this ("the DOM fallback is the real backstop"), but with `expectedShape:'@'` there is no fallback trigger here -- the model receives a "successful" garbage payload instead of a typed `RECIPE_LOGGED_OUT`/`RECIPE_DOM_FALLBACK_PENDING`. Note the rot-detector test suite covers `expectedShape:"items"` (login-HTML correctly fails) and `expectedShape:"@"` only with `data:[]` (empty passes); it does NOT cover `expectedShape:"@"` + a login-HTML string body, so this edge is untested.

**Fix:** This is acceptable for v1 as a documented conservative degrade, but two cheap hardenings would close most of the gap without reading values (still structure-only, no exact-value assertion):
1. In `classifyRecipeBroken`, when `result.data` is a STRING that looks like an HTML document (e.g. starts with `<` after trim, or contains `<html`/`<!doctype` case-insensitively), treat a JSON-API recipe (one whose `extract`/`expectedShape` targets a container path or whose `request` implies JSON) as broken `RECIPE_EXPIRED`. A credentialed JSON endpoint returning an HTML string is a near-certain auth-wall.
2. Add an explicit test asserting `classifyRecipeBroken({success:true,status:200,redirected:false,data:'<html>login</html>'}, {expectedShape:'@'})` and document the chosen behavior (broken vs verbatim) so the decision is locked rather than incidental. At minimum, add the negative test so the current behavior is intentional and regression-guarded.

### WR-02 (medium) [RESOLVED]: T1a head path classifies with `expectedShape` unavailable, so the only rot signals on the bundled-head tier are status/redirect/fetch-failed

**Resolution:** Applied fix (b) -- corrected the misleading contract comments rather than threading a recipe, because a T1a head handler legitimately CANNOT carry an `expectedShape`. Verified against the actual head-handler contract: the T1a slugs are the IMPERATIVE handlers `github.issues.*` / `slack.*` / `notion.*` (`catalog/handlers/*.js`) that build their own bound spec(s) internally and expose `{ tier, handler, origin, sideEffectClass }` -- there is no declarative recipe object and no attachment point for a shape assertion. `registerHandler` (capability-catalog.js) never stores a `recipe`, and `resolve()` for a T1a returns `{ tier, handler, origin, descriptor }` (no recipe), so `entry.recipe` is ALWAYS null on the head path. (The `GITHUB_NOTIFICATIONS_RECIPE` / `REDDIT_INBOX_RECIPE` the original finding cited are the DISTINCT T1b slugs `github.notifications` / `reddit.inbox`, not these.) Fix (a) is therefore not applicable. Updated `extension/utils/capability-router.js:_runHandlerTier` to state plainly that `entry.recipe` is always null on T1a and the expectedShape row is intentionally not exercised there (head-tier rot is detected via status/redirect/fetch-failed only -- the safe under-detect-never-mis-heal direction), and added the matching contract note at `extension/utils/capability-catalog.js` resolve T1a return. No behavior change; router 38/38 + autopilot-parity 13/13 green. Commit: see `fix(32): WR-02`.

**File:** `extension/utils/capability-router.js:549` (`var recipeH = (entry && entry.recipe) ? entry.recipe : null;`); `extension/utils/capability-catalog.js:337-342` (T1a resolve returns no `recipe`)

**Issue:** The T1a classify hook passes `entry.recipe` for the `expectedShape` row, but `resolve()` for a T1a tier returns `{ tier, handler, origin, descriptor }` with NO `recipe` field (catalog:337-342). So `recipeH` is always `null` on the head path, and the `expectedShape` gate in `classifyRecipeBroken` is always skipped for T1a. The result is that a T1a handler whose endpoint rotted to a 200-with-wrong-shape body (the handler succeeded HTTP-wise but the API contract drifted) will NOT be detected as broken -- only a 4xx/5xx/redirect/fetch-fail is. The handlers DO carry an authored `recipe` (catalog:167/172: `GITHUB_NOTIFICATIONS_RECIPE`, `REDDIT_INBOX_RECIPE`), so the shape signal exists but is dropped at the resolve boundary. This is a coverage gap, not an incorrect classification -- the head path simply has a weaker rot signal than the declarative path. Behavior is safe (it under-detects, never mis-heals), but the in-code comment at router:549 ("pass the entry's recipe when present") implies a recipe is sometimes present on a T1a entry when in practice it never is.

**Fix:** Either (a) have `resolve()` include the authored `recipe` on the T1a return shape (catalog:337-342, add `recipe: entry.recipe || null`) so the head path gets the same `expectedShape` rot signal as T1b, or (b) if the omission is deliberate (the head handler may do its own shape validation), update the router:549 comment to state plainly that `entry.recipe` is currently always null on T1a and the shape row is intentionally not exercised there, to avoid implying a signal that is never delivered.

## Info

### IN-01 (low) [RESOLVED]: `redirect:'manual'` makes the `(status >= 300 && status < 400)` branch in the redirected predicate effectively dead

**Resolution:** Took the review's "add a one-line comment" option rather than deleting the disjunct -- the numeric range is genuinely-defensive belt-and-suspenders on a security-relevant signal path (the `redirected` field drives the `RECIPE_LOGGED_OUT` taxonomy), and `capabilityFetchInPage` is a serialization-isolated MAIN-world function where keeping the guard is the conservative choice. Added an explanatory comment at `extension/utils/capability-fetch.js:189` stating that under `redirect:'manual'` a 3xx surfaces as `opaqueredirect` (status 0) so the numeric range is unreachable on this path and kept only as a guard for any future non-manual redirect mode -- it does NOT mean the fetcher follows redirects. This resolves the "misleads a future reader" concern without removing a defensive guard. No behavior change; capability-fetch 26/26 + recipe-path-guard PASS. Commit: see `fix(32): IN-01`.

**File:** `extension/utils/capability-fetch.js:189` (`var redirected = resp.type === 'opaqueredirect' || (status >= 300 && status < 400);`)

**Issue:** The in-page fetch uses `redirect:'manual'` (capability-fetch.js:176). With manual redirect, a 3xx response is returned to the caller as an `opaqueredirect` (status 0, `resp.type === 'opaqueredirect'`), so the live `status` is never in the 300-399 range. The second disjunct `(status >= 300 && status < 400)` is therefore unreachable in practice -- the `opaqueredirect` disjunct is what fires for a login redirect. This is harmless (the OR is correct either way and the `RECIPE_LOGGED_OUT` classification still triggers), but the dead branch can mislead a future reader into thinking the fetcher follows redirects. Not introduced by Phase 32 (pre-existing in the Phase-27 fetcher), noted only because the rot taxonomy now depends on this field.

**Fix:** Optionally drop the dead disjunct or add a one-line comment noting that under `redirect:'manual'` a 3xx surfaces as `opaqueredirect` (status 0), so the numeric range is a belt-and-suspenders guard for any non-manual code path.

### IN-02 (low) [NO CHANGE -- INTENTIONAL FAIL-SAFE]: Re-learn `runDiscovery` is invoked without `confirmedSensitive`, so a sensitive origin silently re-learns nothing

**Resolution:** Left as-is by design. This is the CORRECT credential-replay fail-safe -- a rot-triggered re-learn on a sensitive origin must NOT run without explicit out-of-band confirmation, and `startSession`'s consent gate denying without confirmation (the no-op) is exactly the intended posture (D-03 keeps a synchronous sensitive-origin prompt on the invoke path out of scope). The review itself records "No change required." Confirmed intentional; no source change.

**File:** `extension/utils/capability-router.js:153` (`var dp = discovery.runDiscovery(origin, { tabId: tabId });`)

**Issue:** `_quarantineAndRelearn` calls `runDiscovery(origin, { tabId })` and never threads `confirmedSensitive`. For a sensitive origin, `startSession`'s consent gate denies without confirmation (`discovery-session.js:142-153` -> `{ ok:false, reason:'RECIPE_CONSENT_*' }`), so the opportunistic re-learn is a no-op there. This is the CORRECT fail-safe (a credential-replay re-learn must not run on a sensitive origin without explicit confirmation), and the `.catch` swallow keeps it from poisoning the fallback. Recorded only so it is clear the behavior is intentional: rot-triggered re-learn on a sensitive origin does nothing until the user confirms out-of-band, which matches the consent posture. No change required.

**Fix:** None required. If a future UAT wants rot-triggered re-learn to prompt for sensitive-origin confirmation, that is a deliberate product decision (a synchronous prompt on the invoke path is explicitly out of scope, D-03), not a defect here.

### IN-03 (low) [NO CHANGE -- INTENTIONAL FAIL-SAFE]: `_quarantineAndRelearn` fires re-learn even when the catalog/store quarantine no-ops (unknown or non-string slug)

**Resolution:** Left as-is by design. The independent try-blocks are intentional: re-learn is consent-gated, origin-scoped, best-effort, and only ever reached on the `broken === true` branch with a resolved slug, so a re-learn on a slug whose quarantine no-op'd is benign and theoretical. Gating re-learn on a successful quarantine is an optional v1 tightening, not a defect. The review itself records "None required for v1." Confirmed intentional; no source change.

**File:** `extension/utils/capability-router.js:144-157`

**Issue:** The quarantine and re-learn blocks are independent `try` blocks. If the slug is somehow non-string or the bundled quarantine returns `false` (no-op), the re-learn `runDiscovery` still fires. This is benign (re-learn is consent-gated and origin-scoped, and a spurious discovery attempt on a real origin is harmless and best-effort), but it means a re-learn can be triggered for a slug that was not actually quarantined. Given the only caller is the `broken === true` branch with a resolved slug, this is theoretical.

**Fix:** None required for v1. If tightening is desired, gate the re-learn on a successful quarantine (capture the boolean from `quarantineBundled`/the resolved `store.quarantine`) so re-learn only runs when a recipe was actually demoted.

---

_Reviewed: 2026-06-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
