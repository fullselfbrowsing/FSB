---
phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
verified: 2026-06-20T00:00:00Z
status: human_needed
score: 4/4 roadmap success criteria verified (5/5 FETCH requirements; FETCH-05 CI half verified, live half is accepted human_needed debt)
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification (no prior VERIFICATION.md)
human_verification:
  - test: "FETCH-05 LIVE logged-in-shape (UAT-27-01): signed in to github.com with the active tab on https://github.com, run the hardcoded github.com GET /notifications recipe (catalog/recipes/github-notifications.json) through the Phase-27 entry path (interpretRecipe -> executeBoundSpec) against that tab."
    expected: "HTTP 200 (NOT a 302 to /login?return_to=...) AND/OR a NON-EMPTY <meta name=\"user-login\"> tag (the username). Confirms real first-party HttpOnly cookies (_gh_sess/logged_in) attached in the page MAIN world and the body is the logged-in shape."
    why_human: "The one property the phase exists to de-risk is a live Chrome+GitHub behavior; it cannot run in CI without shipping a real GitHub credential (forbidden by GOV-06/auth-stays-local). Recorded as human_needed in 27-HUMAN-UAT.md; accepted as documented live-browser UAT debt joining the v0.10/v0.11/v0.12 STATE.md ledger (Phase 25 PhantomStream precedent). This is the honest end-state for FETCH-05's live half, NOT a gap."
  - test: "FETCH-05 logged-out contrast (UAT-27-02): sign out of github.com (or use a fresh profile), keep the active tab on https://github.com, run the same recipe."
    expected: "A 302 to /login?return_to=... (surfaced via redirect:'manual' -> redirected===true / opaqueredirect) AND/OR an empty/absent <meta name=\"user-login\"> -- proving the UAT-27-01 result was genuinely cookie-attached, not a static page."
    why_human: "Requires a real signed-out browser session against live github.com; cannot be asserted in CI."
  - test: "Live origin-pin (UAT-27-03): with the active tab on a NON-github https origin, attempt the github.com GET /notifications recipe via the Phase-27 entry path."
    expected: "RECIPE_ORIGIN_MISMATCH (both code and errorCode); NO request fired and NO executeScript side effect (active-tab origin != spec.origin short-circuits in executeBoundSpec before injection)."
    why_human: "Live-browser confirmation of the active-tab pin; the mock-side equivalent is already proven green in tests/capability-fetch.test.js (FETCH-03 mismatch -> RECIPE_ORIGIN_MISMATCH, recorder EMPTY)."
---

# Phase 27: Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar Verification Report

**Phase Goal:** Prove the riskiest unknown — a same-origin authenticated `fetch` (cookies/CORS/CSRF/SameSite) through the page MAIN world against ONE hardcoded recipe — and build origin-pinning and SW-eviction survival into the primitive from the start.
**Verified:** 2026-06-20
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Every FSB-owned mechanic of the phase goal is VERIFIED in the actual codebase and proven by automated checks I ran myself (not from SUMMARY claims). The single outstanding item is the irreducibly-LIVE half of FETCH-05 (real GitHub HttpOnly cookies attaching in a real signed-in session), correctly recorded as `human_needed` UAT debt and accepted as documented closeout per the FSB Phase-25 precedent. Per the Step-9 decision tree, a non-empty human-verification section forces `status: human_needed` (NOT `passed`, NOT `gaps_found`).

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | SC1 (FETCH-01+02): an authenticated API call executes in the page MAIN world via `chrome.scripting.executeScript({world:'MAIN', func, args})` so first-party HttpOnly/SameSite cookies attach (`credentials:'include'`), and the primitive scrapes & sends per-form CSRF tokens + the auth-strategy headers. | VERIFIED | `capability-fetch.js:320-324` injects `world:'MAIN', func:capabilityFetchInPage, args:[spec]`; `:173` `credentials:'include'`; `:138-165` CSRF live-scrape threads `headers[src.header]` (.value for input / .content for meta). The func is a FIXED named function (Wall-1: zero eval/new Function/import( — grep-confirmed). `tests/capability-fetch.test.js` FETCH-01 asserts the captured `{world:MAIN, func, args:[spec]}` call + a `func.toString()` static guard (contains `credentials`/`include`, NONE of jmespath/getFSB/require/importScripts); FETCH-02 asserts the X-CSRF-Token threads from both meta (.content) and input (.value). 26/0 PASS, exit 0. |
| 2 | SC2 (FETCH-03): origin-pinning enforced inside the interpreter; a cross-origin target is rejected before any side effect. | VERIFIED | `capability-interpreter.js:325-336` folds query into the effective URL (5b) BEFORE `:338-357` the origin-pin re-assertion (5c): `new URL(effectiveUrl, recipe.origin).origin !== recipe.origin` -> typed `RECIPE_ORIGIN_MISMATCH` (dual code+errorCode via createRecipeError) BEFORE the spec is returned; `spec.url=effectiveUrl` (:361). `tests/capability-interpreter.test.js` proves cross-origin AND protocol-relative rejection, each with executeScript/fetch recorders unchanged (no side effect). The complementary active-tab (second-layer) pin lives in `capability-fetch.js:291-298`. 51/0 PASS, exit 0; no-network charter intact (0 executeScript, 0 fetch across the suite). |
| 3 | SC3 (FETCH-04): an in-flight call survives MV3 SW eviction via the `run_task` resume-sidecar; mid-mutation ambiguity is `RECOVERY_AMBIGUOUS` and never blind-retried. | VERIFIED | `capability-fetch.js:306-315` writes a `BEFORE_API_REQUEST` in_progress snapshot (method+origin) via the reused `FsbMcpTaskStore` BEFORE executeScript, terminal-writes then deletes on completion (:346-353). `classifyOnWake` (:405-428) returns `RECOVERY_AMBIGUOUS` for POST/PUT/PATCH/DELETE in-flight (default fall-through is also the fail-safe RECOVERY_AMBIGUOUS), a re-issuable verdict for GET/HEAD, SAFE for terminal markers. `RECOVERY_AMBIGUOUS` is registered in `mcp/src/errors.ts:71` CODE_ONLY_ERROR_KEYS and present in the built `mcp/build/errors.js` (grep-confirmed after `npm --prefix mcp run build` exit 0). `tests/capability-fetch.test.js` asserts the snapshot lifecycle (observable DURING, deleted AFTER), classifyOnWake POST/DELETE->RECOVERY_AMBIGUOUS, GET->re-issuable, and that mapFSBError surfaces RECOVERY_AMBIGUOUS verbatim (not action_rejected). |
| 4 | SC4 (FETCH-05): a smoke test asserts the logged-in (not logged-out) data shape from the chosen execution context against a real HttpOnly-cookie site. | VERIFIED (CI half) / human_needed (LIVE half) | CI half: `tests/capability-fetch.test.js` drives the REAL `interpretRecipe -> executeBoundSpec` path against a logged-in-shape fixture InjectionResult (`status:200, finalUrl:'https://github.com/notifications'`, body with `items`), asserts `success:true, status:200`, and proves the SW-side JMESPath extract returns real data `items[*].id -> [1,2]`; the on-disk `github-notifications.json` validates against the closed schema. Only the `executeScript` browser boundary is stubbed — every FSB-owned mechanic runs for real. 26/0 PASS, exit 0. LIVE half: real GitHub HttpOnly cookies attaching -> logged-in body shape is recorded as `human_needed` in `27-HUMAN-UAT.md` UAT-27-01 (200-not-302 / non-empty user-login meta) and accepted as documented UAT debt (STATE.md ledger line 154). NOT a fabricated pass. |

**Score:** 4/4 ROADMAP success criteria verified in code (the FETCH-05 live half is accepted human_needed debt, the honest designed end-state).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `extension/utils/capability-interpreter.js` | query-fold + origin-pin re-assertion; RECIPE_ORIGIN_MISMATCH | VERIFIED | Fold (5b :325-336) before pin (5c :338-357); `RECIPE_ORIGIN_MISMATCH` present (1 occurrence in assembly path); no fetch/executeScript/eval/new Function/import( in active code (no-network charter, 26-D-11, intact). |
| `extension/utils/capability-fetch.js` | capabilityFetchInPage + executeBoundSpec + classifyOnWake | VERIFIED | 443 lines, ASCII-clean, dual-export IIFE; all 3 exports present (:432-436); Wall-1 dynamic-code-free (grep: NONE); on the recipe-path allowlist (guard PASS). |
| `mcp/src/errors.ts` | RECOVERY_AMBIGUOUS in CODE_ONLY_ERROR_KEYS | VERIFIED | Registered :71; surfaced verbatim by resolveErrorKey (:111); present in built `mcp/build/errors.js` after build exit 0. |
| `scripts/verify-recipe-path-guard.mjs` | capability-fetch.js on RECIPE_PATH_ALLOWLIST | VERIFIED | Allowlist entry present; guard PASS (7 recipe-path files clean, 4 on-disk capability modules all allowlisted); existsSync pre-check (Plan-01 auto-fix) keeps present-file scan + Check 4 disk-drift intact. |
| `catalog/recipes/github-notifications.json` | hardcoded FETCH-05 proof recipe (same-origin-cookie) | VERIFIED | schemaVersion 1, id github.notifications, origin https://github.com, endpoint /notifications, GET, authStrategy same-origin-cookie, extract '@'; validateRecipe accepts it (asserted in test). |
| `catalog/recipes/_fixtures/valid-github-notifications.json` | identical copy for guard Check 2 | VERIFIED | Present; validated by the recipe-path guard's Check 2. |
| `extension/background.js` | additive importScripts capability-fetch.js, last of capability family | VERIFIED | One additive line (:143) after capability-interpreter.js; no reorder. |
| `tests/capability-fetch.test.js` | FETCH-01..05 CI smoke suite (min 120 lines) | VERIFIED | 340 lines; 26/0 PASS; explicit assertions for each FETCH requirement. |
| `27-HUMAN-UAT.md` | human_needed live FETCH-05 UAT in FSB format | VERIFIED | status human_needed; Setup + Required Scenarios (UAT-27-01/02/03) + Recording Results; names the recipe; mirrors the Phase-25 precedent (which exists). |

### Key Link Verification

(The gsd-sdk verb reported "Source file not found" for plan-02/03 multi-token `from:` fields — a parser artifact, NOT a real miss; all links manually confirmed against source below.)

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| capability-fetch.js executeBoundSpec | executeScript world MAIN func capabilityFetchInPage args spec | fixed func injection (NOT eval/new Function) | WIRED | :320-324 `world:'MAIN', func:capabilityFetchInPage, args:[spec]`. |
| capability-fetch.js executeBoundSpec | FsbMcpTaskStore.writeSnapshot BEFORE_API_REQUEST | resume-sidecar write before fetch | WIRED | :306-315 writeSnapshot with current_step 'BEFORE_API_REQUEST' before executeScript. |
| capability-fetch.js executeBoundSpec | FsbCapabilityInterpreter.getFSBJmespath().search | SW-side extract after body returns | WIRED | :367-370 `jp.search(r.json, spec.extract)` after the body crosses back. |
| background.js | importScripts utils/capability-fetch.js | additive SW bootstrap | WIRED | :143 importScripts after capability-interpreter.js. |
| capability-interpreter.js | createRecipeError RECIPE_ORIGIN_MISMATCH | typed RETURN, both code+errorCode | WIRED | :353-356 createRecipeError('RECIPE_ORIGIN_MISMATCH', ...). |
| mcp/src/errors.ts | CODE_ONLY_ERROR_KEYS RECOVERY_AMBIGUOUS | resolveErrorKey verbatim passthrough | WIRED | :71 Set member; built errors.js carries it. |
| 27-HUMAN-UAT.md UAT-27-01 | catalog/recipes/github-notifications.json | the recipe the human runs | WIRED | UAT-27-01 names the recipe (:23) and pins active tab to https://github.com. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| executeBoundSpec return.data | `data` (extracted) | `r.json` from the page func -> `getFSBJmespath().search(r.json, spec.extract)` | Yes — test asserts `items[*].id -> [1,2]` flows through the real SW-side extract | FLOWING |
| capabilityFetchInPage return | `json`/`text`/`status` | real `fetch(spec.url, {credentials:'include'})` (only the executeScript transport is stubbed in CI) | Yes (mock half); LIVE cookie-attached shape is the human_needed UAT | FLOWING (CI) / human_needed (live) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| capability-fetch CI suite (FETCH-01..05 mock half) | `node tests/capability-fetch.test.js` | 26 passed / 0 failed, exit 0 | PASS |
| interpreter query-fold + origin-pin (cross-origin + protocol-relative) | `node tests/capability-interpreter.test.js` | 51 passed / 0 failed, exit 0 | PASS |
| recipe-path CI guard (Wall-1 dynamic-code-free + allowlist) | `node scripts/verify-recipe-path-guard.mjs` | PASS (4 on-disk capability modules allowlisted), exit 0 | PASS |
| RECOVERY_AMBIGUOUS in built MCP errors | `npm --prefix mcp run build` + `grep RECOVERY_AMBIGUOUS mcp/build/errors.js` | build exit 0; grep count 1 | PASS |
| full test chain green (no regression) | `npm test` | 5817 PASS, all `failed: 0`, exit 0 | PASS |
| module exports the three required functions | source read | capabilityFetchInPage, executeBoundSpec, classifyOnWake all exported | PASS |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` declared for this phase; verification used the named test suites above (which the PLAN/SUMMARY declare as the runnable checks). The full `npm test` chain (5817 PASS, exit 0) is the authoritative green-state confirmation.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FETCH-01 | 27-02 | MAIN-world authenticated fetch via execute_js seam; first-party cookies attach | SATISFIED | executeScript world:MAIN + credentials:'include'; CI FETCH-01 assertions green. |
| FETCH-02 | 27-02 | Scrape & send per-form CSRF tokens + auth-strategy headers | SATISFIED | In-page CSRF scrape threads headers[csrfSource.header]; CI FETCH-02 (.content + .value) green. |
| FETCH-03 | 27-01, 27-02 | Origin-pin in the interpreter; cross-origin rejected before side effect | SATISFIED | Interpreter fold-then-pin (RECIPE_ORIGIN_MISMATCH) + active-tab pin; cross-origin + protocol-relative + mismatch tests green, no side effect. |
| FETCH-04 | 27-01, 27-02 | Survive SW eviction via resume-sidecar; mid-mutation -> RECOVERY_AMBIGUOUS, never blind-retried | SATISFIED | BEFORE_API_REQUEST snapshot + classifyOnWake; RECOVERY_AMBIGUOUS registered + built + surfaced verbatim; CI green. |
| FETCH-05 | 27-02 (CI), 27-03 (live) | Smoke test asserts logged-in data shape against a real HttpOnly site | SATISFIED (CI) / NEEDS HUMAN (live) | CI smoke half green (logged-in-shape success through the real bind+wrapper path, stubbed executeScript). Live half = human_needed UAT-27-01, accepted documented debt (NOT fabricated). |

No ORPHANED requirements: REQUIREMENTS.md maps exactly FETCH-01..05 to Phase 27, and all five are claimed across the plan `requirements:` fields.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | TBD/FIXME/XXX debt markers | - | None found in any phase-modified source file (debt-marker gate PASSES). |
| (none) | - | TODO/HACK/PLACEHOLDER | - | None found. |
| capability-fetch.js | 97 | `return null` | Info (not a stub) | `_getJmespathEngine()` graceful-degradation accessor (returns null when the engine global is absent). The extract is proven to flow real data (`[1,2]`) when the engine is present; this is correct fail-open, not a hollow stub. |

Code review (27-REVIEW.md) found 0 critical, 3 warnings (WR-01 in-primitive origin guard, WR-02 same-ms taskId collision, WR-03 mixed-case origin normalization), 4 info. All three warnings are explicitly defense-in-depth / latent with ZERO present blast radius because `executeBoundSpec`/`classifyOnWake` are not yet wired to any caller (the router is deferred to Phase 28/29). They do not block any Phase-27 goal truth and are noted, not gating.

### Deferred Items

The review-noted hardening (WR-01..03) and the `from:'response'` CSRF source (D-06) have their genuine consumer — the tiered router via `invoke_capability` — explicitly scheduled in later milestone phases (confirmed in the roadmap):

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Router/caller wiring that exercises executeBoundSpec (gives WR-01/02/03 any blast radius) | Phase 28 / Phase 29 | Phase 28 "Lean MCP Surface + Capability Search" + Phase 29 "Catalog + Tiered Router … invoke_capability" call executeBoundSpec. |
| 2 | `from:'response'` CSRF + learned recipes | Phase 29 / Phase 31 | D-06 defers from-response; Phase 31 "Network-Capture Discovery + Recipe Synthesis + Learned Recipes". |

These are informational — Phase 27's goal is the primitive itself, which is complete.

### Human Verification Required

The phase goal's one irreducibly-live property — real GitHub HttpOnly cookies attaching in the page MAIN world and yielding a logged-in (not logged-out) body shape — cannot run in CI without shipping a real GitHub credential (forbidden by GOV-06 / auth-stays-local). It is recorded honestly as `human_needed` UAT debt in `27-HUMAN-UAT.md` and entered on the STATE.md live-browser UAT ledger (Phase 25 PhantomStream precedent). Per the verification-focus honesty note, this is the CORRECT accepted closeout for FETCH-05's live half — not a gap.

1. **UAT-27-01 — Live logged-in shape (FETCH-05 live half).** Signed in to github.com, active tab on https://github.com, run `catalog/recipes/github-notifications.json` (GET /notifications) through `interpretRecipe -> executeBoundSpec`. **Expected:** HTTP 200 (not 302 to /login) AND/OR non-empty `<meta name="user-login">`. **Why human:** live Chrome+GitHub cookie behavior; no CI credential allowed.
2. **UAT-27-02 — Logged-out contrast.** Same recipe signed out / fresh profile. **Expected:** 302 to /login (via redirect:'manual' -> redirected) AND/OR empty user-login meta. **Why human:** confirms UAT-27-01 was genuinely cookie-attached.
3. **UAT-27-03 — Live origin-pin.** Active tab on a non-github origin, attempt the recipe. **Expected:** RECIPE_ORIGIN_MISMATCH, no request fired. **Why human:** live confirmation; the mock equivalent is already green in CI.

### Gaps Summary

No gaps. Every FSB-owned mechanic of the phase goal is implemented, substantive, wired, data-flowing, and proven by the five automated checks I ran myself (capability-fetch 26/0, capability-interpreter 51/0, recipe-path guard PASS, MCP build + RECOVERY_AMBIGUOUS in built errors, full npm test 5817 PASS / exit 0). All 5 FETCH requirements are accounted for against REQUIREMENTS.md with no orphans. The only outstanding item is the deliberately-deferred LIVE half of FETCH-05, recorded as accepted `human_needed` UAT debt in the established FSB format — which (per the Step-9 decision tree) sets the phase status to `human_needed`, the honest classification for a goal whose code is fully verified but whose one live-browser property awaits a human run. This is NOT `gaps_found` and NOT a blind `passed`.

---

_Verified: 2026-06-20_
_Verifier: Claude (gsd-verifier)_
