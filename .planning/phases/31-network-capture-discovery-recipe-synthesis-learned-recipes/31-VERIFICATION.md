---
phase: 31-network-capture-discovery-recipe-synthesis-learned-recipes
verified: 2026-06-22T00:00:00Z
status: passed
score: 8/8 must-haves verified (4 ROADMAP success criteria + 8 requirement IDs; 15 targeted suites + guards GREEN)
overrides_applied: 0
human_verification_debt:
  - test: "Live end-to-end discovery loop on a real authenticated origin (UAT-31-01): trigger a discovery session, confirm the 'FSB started debugging this browser' banner appears + clears, observe a real same-origin XHR/Fetch, confirm it is redacted + synthesized + replayed through the live credentialed fetch + promoted, then findable + outranks the generic on the next visit, and the fsbLearnedRecipes envelope carries SHAPE ONLY (no secret/body/query/header-value)."
    expected: "Banner appears and clears without disrupting Input emulation; a same-origin API call is captured, redacted, synthesized, replayed, promoted; the learned recipe is findable and outranks the generic; the stored envelope is shape-only with zero persisted secrets."
    why_human: "Requires a live Chrome extension load + a real authenticated first-party session + the real chrome.debugger Network-domain attach — cannot run in the headless CI gate without shipping a real credential. Documented debt (31-HUMAN-UAT.md, result: pending), matching the Phase 27/28/29/30 live-UAT posture. Does NOT block the headless gate; every FSB-owned property of the loop is proven headlessly by the 15 targeted suites."
---

# Phase 31: Network-Capture Discovery + Recipe Synthesis + Learned Recipes Verification Report

**Phase Goal:** Add the highest-novelty auto-growth layer — consent-gated CDP Network capture that discovers real API calls, synthesizes per-origin declarative recipes, and promotes them to procedural memory — stacking only on the now-proven consent, memory, and router layers.

**Verified:** 2026-06-22
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

This phase delivers a consent-gated CDP Network capture → capture-time structural redaction → closed-vocab recipe synthesis → promote-after-replay → per-origin learned store → T2-outranking-router growth layer, stacking on the proven Phase 28 (search), Phase 29 (router/catalog/T2 stub), and Phase 30 (consent/signature/redaction) layers. Every FSB-owned property was verified directly in the codebase (modules read, not SUMMARY-trusted) and against a live run of all 15 targeted suites + the named guards + the mcp build. The ONE irreducibly-live property (the real authenticated end-to-end loop) is documented `human_needed` debt, not a gap.

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth (SC) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | With consent, CDP Network capture extends the EXISTING `chrome.debugger` attach with the Network domain — no manifest change, no Input-emulation disruption — and runs only on Ask/Auto origins, never default-Off. | VERIFIED | `network-capture.js` (454 lines) `_runGate` runs the Phase-30 gate BEFORE attach; `network-capture.test.js` 24/0 (method-dispatched onEvent, Input sendCommand unaffected, cross-tab events ignored); `network-capture-consent.test.js` 11/0 (Off+denied rejected, Ask/Auto allowed, sensitive needs `confirmedSensitive`). `extension/manifest.json` `"debugger"` perm present (line 15); NO Phase-31 commit touched the manifest (git log cross-check); only foreign version-bump/lattice drift vs main. `_onCdpEvent` registered ONCE at boot (background.js:260, ME-01 fix). |
| 2 | Captured requests are redacted at capture time, before any persistence, stripping auth/cookie/token/CSRF material. | VERIFIED | `network-capture-redactor.js` (147 lines) is STRUCTURAL: `redactRequest` iterates header KEYS only (`for..in` + own-key guard, never reads a value), drops query+fragment (`_shapeUrl` keeps `u.pathname` only), returns `{method,path,origin,headerNames}` with NO body/postData field by construction; `redactResponse` returns `{status,mimeType}` only. Auth-carrier denylist broadened (line 62: authorization/proxy-authorization/authentication/cookie/set-cookie/x-csrf*/x-xsrf*/x-api-key/x-auth*/x-access-token/*bearer*, ME-03 fix). `network-capture-redaction.test.js` 33/0 feeds REAL secret literals (`sk-LIVE-SECRETtoken-DEADBEEF`, `Bearer`+token, session/CSRF values), stringifies the WHOLE redacted artifact, asserts none survive. ZERO `getResponseBody`/`getRequestPostData` anywhere in the entire extension SW surface. |
| 3 | A discovered-and-replayed call is synthesized into a declarative recipe and promoted to per-origin procedural memory storing request SHAPE only (endpoint, method, header-map, csrf-source, extract-path, origin) — never bodies/PII. | VERIFIED | `recipe-synthesizer.js` (396 lines) emits a `validateRecipe`-green recipe+descriptor or null; authStrategy capped to declarative-executable (`same-origin-cookie` default / `csrf-header-scrape` with csrf.from in {meta,cookie} only; NEVER `csrf.from:'response'` → `same-origin-cookie`+`flaggedForPhase32`); rejects protocol-relative/traversal/non-http origins. `discovery-session.js` (311 lines) promotes ONLY after a clean replay through the REAL `interpretRecipe(recipe,{},{trustedProvenance:'local'}) → executeBoundSpec` path (re-pins origin). `learned-recipe-store.js` (520 lines) stores a per-origin versioned `fsbLearnedRecipes` envelope (shape only). Tests: `recipe-synthesizer` 21/0, `learned-promote-after-replay` 12/0 (failed interpret/execute → NOT stored, no side effect), `learned-recipe-store` 21/0. Synthesizer/discovery read NO raw header value/body/query/postData (disconfirm grep clean). |
| 4 | Learned recipes feed the capability search index so they are findable on the next visit, and a learned recipe for an origin outranks generic recipes during routing. | VERIFIED | `capability-search.js` (403 lines) `addLearnedRecipe` feeds the ONE MiniSearch index (INDEX_OPTIONS reused) + slug→recipe map + bumped `+learnedN` snapshot; HI-01 fix: base-prefix-tolerant restore (split on `+learned`, lines 141-147) so the learned slug survives a REAL `buildOrRestore()` SW restart. `capability-catalog.js` `resolve` checks `_getLearned(slug,origin)` FIRST (line 259) → `{tier:'T2',recipe}` BEFORE the REGISTRY lookup (line 268) → outranks generic T1b; wired to the REAL `FsbLearnedRecipeStore.getLearnedSync` (production, closed in 31-06). `capability-router.js` case 'T2' dispatches `_runDeclarativeTier(...,{trustedProvenance:'local'})` when a recipe is attached, `RECIPE_LEARN_PENDING` only when none (lines 512-514). Hard origin-scope (`entry.recipe.origin !== origin → null`). Tests: `learned-search-add` 15/0 (findable AFTER real restart — "was [] before the fix"), `learned-t2-outranking` 10/0. |

**Score:** 4/4 ROADMAP success criteria verified · 8/8 requirement IDs satisfied.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `extension/utils/network-capture.js` | consent-gated CDP Network session over the existing attach (startSession/endSession) | VERIFIED | 454 lines; committed clean (d22543c6 +fixes); consent gate inside startSession; same-origin XHR/Fetch filter; ownership-safe release; null/non-http origin fail-closed (LO-02). |
| `extension/utils/network-capture-redactor.js` | redactRequest/redactResponse — capture-time security boundary | VERIFIED | 147 lines; structural shape-only exclusion; exports redactRequest+redactResponse; ME-03 denylist broadened. |
| `extension/utils/recipe-synthesizer.js` | synthesize(observedCall) → {recipe,descriptor}\|null; validateRecipe-gated | VERIFIED | 396 lines; on RECIPE_PATH_ALLOWLIST (eval-free, guard GREEN); authStrategy cap; rejects bad origins. |
| `extension/utils/learned-recipe-store.js` | per-origin versioned store; getLearned/promote/quarantine/readAll + getLearnedSync mirror; LRU | VERIFIED | 520 lines; `fsbLearnedRecipes` envelope; LRU by lastSuccessAt; quarantine flags-not-deletes (D-16); hard origin-scope; on allowlist. |
| `extension/utils/discovery-session.js` | runDiscovery — capture→synthesize→replay→promote (promote-after-replay) | VERIFIED | 311 lines; threads `{trustedProvenance:'local'}` through interpretRecipe→executeBoundSpec; promote+addLearnedRecipe only on clean replay. |
| `extension/utils/capability-signature.js` | verifyRecipeEnvelope recognizes 'local' alongside 'bundled' (loader-vouched) | VERIFIED | resolvedProvenance from `arguments.length>=2 ? trustedProvenance : envelope.provenance` (line 243); short-circuit on trusted 'local'/'bundled' BEFORE verify (line 257). |
| `extension/utils/capability-interpreter.js` | interpretRecipe exempt short-circuit for trustedProvenance==='local' | VERIFIED | trustedProvenance from `opts.trustedProvenance` ONLY (lines 329-330); short-circuit at line 365; payload-asserted provenance NEVER consulted (HI-01). |
| `extension/utils/capability-catalog.js` | resolve checks _getLearned() first (T2 with recipe); _getLearned accessor | VERIFIED | `_getLearned` (lines 77-83) → real getLearnedSync; resolve learned-first (line 259); exported (line 318). |
| `extension/utils/capability-router.js` | case 'T2' dispatches _runDeclarativeTier(...,{trustedProvenance:'local'}) when learned | VERIFIED | lines 503-514; RECIPE_LEARN_PENDING only when no recipe; T0/T1b callers stay opts-free (head byte-identical). |
| `extension/utils/capability-search.js` | addLearnedRecipe + removeLearnedRecipe + snapshot re-persist | VERIFIED | addLearnedRecipe feeds the one index + slug map + bumped snapshot; HI-01 prefix-tolerant restore; removeLearnedRecipe (LO-01) drops LRU-evicted slug. |
| `extension/background.js` | additive importScripts + Network onEvent listener + discovery entry | VERIFIED | 15731 lines; importScripts lines 229-233 (dep order); _onCdpEvent registered once at boot (line 260); parses clean (`node --check` exit 0); manifest untouched. |
| `extension/ws/mcp-tool-dispatcher.js` | internal mcp:capabilities-discover route → runDiscovery (OUT of TOOL_REGISTRY) | VERIFIED | route at line 122; handler resolves AUTHORITATIVE origin from the real tab (ME-02, line 294), rejects mismatched payload.origin; NOT a TOOL_REGISTRY entry. |
| 9 test suites + cdp-event-driver.js | RED→GREEN coverage, wired into scripts.test | VERIFIED | all 9 exist (127-156 lines each), all WIRED into package.json scripts.test, all GREEN. cdp-event-driver.js 157 lines. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `network-capture.js startSession` | `getConsentForOrigin / isDenied / classify` | Phase-30 gate before attach | WIRED | Gate runs inside startSession; fail-closed when consent store absent (REASON_REQUIRED); sensitive needs confirm. `network-capture-consent` 11/0. |
| `network-capture.js _onCdpEvent` | `network-capture-redactor.js redactRequest` | redact AT the event handler | WIRED | Redaction at the handler before anything leaves the frame. |
| `recipe-synthesizer.js synthesize` | `FsbCapabilityRecipeSchema.validateRecipe` | validate before return (reject→null) | WIRED | `recipe-synthesizer` 21/0 (malformed → null). |
| `learned-recipe-store.js` | `chrome.storage.local 'fsbLearnedRecipes'` | versioned envelope mirroring consent-policy-store | WIRED | STORAGE_KEY='fsbLearnedRecipes' (line 57); `learned-recipe-store` 21/0. |
| `capability-interpreter.js interpretRecipe` | exempt short-circuit | trustedProvenance==='local' → bindRecipeCore (no verify) | WIRED | line 365; `learned-local-provenance-exempt` 7/0 (zero verifyEd25519 on vouch; self-asserted 'local' STILL verified). |
| `capability-signature.js verifyRecipeEnvelope` | resolvedProvenance short-circuit | ==='local' → {ok:true} | WIRED | line 257; loader-resolved, not payload-read. |
| `capability-catalog.js resolve` | `FsbLearnedRecipeStore.getLearnedSync` | _getLearned BEFORE the REGISTRY lookup | WIRED | line 259 before line 268; production getLearnedSync (31-06). |
| `capability-router.js case 'T2'` | `_runDeclarativeTier(...,{trustedProvenance:'local'})` | dispatch learned via declarative tier with the local vouch | WIRED | lines 512-514; `learned-t2-outranking` 10/0. |
| `capability-search.js addLearnedRecipe` | the one _ms + INDEX_OPTIONS + STORAGE_KEY snapshot | mutate same index, re-snapshot bumped version | WIRED | `learned-search-add` 15/0 (findable after REAL buildOrRestore restart). |
| `discovery-session.js runDiscovery` | startSession + synthesize + interpretRecipe→executeBoundSpec + promote + addLearnedRecipe | promote-after-replay orchestration | WIRED | full chain present (lines 142-234); replay through the REAL path. |
| `mcp-tool-dispatcher.js` | `FsbDiscoverySession.runDiscovery` | internal mcp:capabilities-discover route (OUT of TOOL_REGISTRY) | WIRED | route line 122 → handler line 2265; INV-01 hash unmoved. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `capability-catalog.js resolve` | learned T2 recipe | `FsbLearnedRecipeStore.getLearnedSync` (real per-origin hydrated mirror) | Yes — production wiring (31-06), not a test stub; hard origin-scoped | FLOWING |
| `capability-search.js search()` | learned slug discovery | the one MiniSearch `_ms` index + bumped snapshot, restored across SW restart | Yes — survives real `buildOrRestore()` (HI-01 fix proven) | FLOWING |
| `discovery-session.js summary.promoted` | promoted learned recipes | real `interpretRecipe→executeBoundSpec` clean replay, then `store.promote` + `addLearnedRecipe` | Yes — only a clean replay promotes; failed replay discards | FLOWING |
| Live capture → ObservedCall | redacted same-origin XHR/Fetch | real `chrome.debugger` Network attach (live half) | Deferred — proven headlessly via canned cdp-event-driver; the live attach is human_needed debt | STATIC (headless) / live deferred |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All 9 core Phase-31 suites pass | `node tests/{network-capture,...,learned-local-provenance-exempt}.test.js` | 9/9 GREEN (154 assertions, 0 fail) | PASS |
| INV-01 frozen registry hash + capability-discover OUT of TOOL_REGISTRY | `node tests/tool-definitions-parity.test.js` · `capability-mcp-surface.test.js` | 256/0 · 19/0 | PASS |
| INV-04 iterator byte-untouched | `node tests/agent-loop-iterator-guard.test.js` | "exactly 4 setTimeout iterator-schedule callsites remain"; 4/0 | PASS |
| INV-02 one-engine parity | `node tests/capability-autopilot-parity.test.js` | 10/0 | PASS |
| Router + search-eval unregressed | `node tests/capability-router.test.js` · `capability-search-eval.test.js` | 27/0 · 11/0 | PASS |
| recipe-path guard (new modules eval-free + allowlisted) | `node scripts/verify-recipe-path-guard.mjs` | PASS (19 recipe-path files clean, 8 on-disk modules allowlisted) | PASS |
| background.js parses clean | `node --check extension/background.js` | exit 0 | PASS |
| mcp build works in the main tree | `npm --prefix mcp run build` | exit 0 (tsc + tool-definitions copy clean) | PASS |
| No manifest change (Phase-31 commits) | `git log` cross-check of Phase-31 commits vs extension/manifest.json | zero Phase-31 commits touched the manifest | PASS |
| No getResponseBody persistence anywhere | `grep -rn getResponseBody extension/` | zero matches across the SW surface | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared or implied for this phase. The phase uses the zero-framework FSB convention (`node tests/<name>.test.js`); the executable verification surface is the 15 targeted suites + the recipe-path guard + the mcp build, all run above and GREEN. N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DISC-01 | 31-06 | With consent, CDP Network capture observes a page's real API calls to discover candidate capabilities | SATISFIED (live half human_needed) | discovery-session orchestrator + mcp:capabilities-discover route + background onEvent wiring all present; headless proof complete; the live attach is documented UAT debt. |
| DISC-02 | 31-01/02/06 | Discovery reuses the existing chrome.debugger attachment by adding the Network domain (no manifest change) without disrupting Input emulation | SATISFIED | `"debugger"` perm pre-existing; no Phase-31 manifest commit; method-dispatched onEvent leaves Input sendCommand untouched (`network-capture` 24/0); _onCdpEvent single boot owner (ME-01). |
| DISC-03 | 31-01/02 | Captured requests redacted at capture time, before persistence, stripping auth/cookie/token/CSRF | SATISFIED | structural redactor (names-only, no body/query); `network-capture-redaction` 33/0 with real secret literals. |
| DISC-04 | 31-01/02 | Discovery runs only on Ask/Auto origins, never default-Off | SATISFIED | consent gate before attach; Off+denied rejected, sensitive needs confirm; gate targets the real attached origin (ME-02). `network-capture-consent` 11/0. |
| LEARN-01 | 31-01/03/04/06 | A discovered-and-replayed call is synthesized into a declarative recipe and promoted to per-origin procedural memory | SATISFIED | synthesize→validateRecipe→replay→promote (promote-after-replay, D-10); `recipe-synthesizer` 21/0, `learned-promote-after-replay` 12/0; 'local' provenance exemption loader-vouched (`learned-local-provenance-exempt` 7/0). |
| LEARN-02 | 31-01/02/03 | Learned recipes store request shape only — never response bodies or PII | SATISFIED | shape-only redactor + shape-only synthesizer + shape-only `fsbLearnedRecipes` envelope; no getResponseBody anywhere; disconfirm grep clean. |
| LEARN-03 | 31-01/05 | Learned recipes feed the capability search index so they are findable on the next visit | SATISFIED | addLearnedRecipe feeds the one index; HI-01 fix makes the learned slug survive a REAL buildOrRestore SW restart (`learned-search-add` 15/0, "was [] before the fix"). |
| LEARN-04 | 31-01/05 | A learned recipe for an origin outranks generic recipes during routing | SATISFIED | catalog resolve learned-first → T2; router dispatches via _runDeclarativeTier with the local vouch; production getLearnedSync wiring fires at runtime (`learned-t2-outranking` 10/0). |

No orphaned requirements: the union of plan `requirements` fields equals the 8 phase IDs; all 8 map to Phase 31 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX in any of the 5 new modules | — | Clean — completion is auditable. |
| recipe-synthesizer.js / learned-recipe-store.js | various | `flaggedForPhase32` deferral markers | ℹ️ Info | Intentional, tracked Phase-32 hand-off (self-healing/recipe-rot is explicitly NOT this phase, D-16). Not debt. |

No blocker or warning anti-patterns. The 6 code-review findings (1 HIGH LEARN-03 restart break + 3 medium + 2 low) are all FIXED, COMMITTED (ff7c6f13, 4e83806b, 287c21ef, 13f12eb6, ef9bade3, f33a5bf8), and re-verified GREEN by direct codebase reading + the live gate run.

### Human Verification Debt (does NOT block — documented, matching Phase 27/28/29/30 posture)

#### UAT-31-01: Live capture → synthesize → promote → outrank smoke

**Test:** On a real authenticated origin, trigger a discovery session via the internal `mcp:capabilities-discover` route. Confirm the "FSB started debugging this browser" banner appears and CLEARS at session end without breaking Input emulation. Within the session bound, fire a same-origin XHR/Fetch; confirm a learned recipe is synthesized + promoted (non-empty `promoted` list). On the next visit, confirm it is findable via `search_capabilities` and OUTRANKS the generic (dispatches as T2). Inspect the `fsbLearnedRecipes` key and confirm SHAPE ONLY — method/path-template/header NAMES/origin/extract, no secret/body/query/header-value.
**Expected:** Banner appears and clears cleanly; a same-origin call is captured/redacted/synthesized/replayed/promoted; the learned recipe is findable and outranks the generic; the stored envelope is shape-only with zero persisted secrets.
**Why human:** Requires a live Chrome extension load + a real authenticated first-party session + the real `chrome.debugger` Network-domain attach — none can run headlessly without shipping a real credential. Recorded as `human_needed` / `result: pending` in `31-HUMAN-UAT.md`. The headless CI gate (the 15 targeted suites + INV-01/02/04 proofs + recipe-path guard + mcp build) does NOT depend on this step; every FSB-owned property of the loop is proven headlessly.

### Gaps Summary

No gaps. All 4 ROADMAP success criteria and all 8 requirement IDs (DISC-01..04, LEARN-01..04) are verified directly in the codebase, not inferred from SUMMARY claims. The security-critical properties are STRUCTURAL and confirmed by reading the source: capture-time redaction excludes bodies/header-values/query/PII by construction (the redactor cannot read an excluded field); the HI-01 provenance trust channel resolves 'local' ONLY from the loader's vouch (a self-asserting payload is still verified); promotion happens ONLY after a clean replay through the real interpretRecipe→executeBoundSpec path; the learned store is a NEW per-origin envelope (not the 500-cap memory layer) with LRU + quarantine-not-delete; learned recipes outrank generics by catalog resolve order via the production getLearnedSync wiring; and the LEARN-03 SW-restart break (the one HIGH finding) is fixed and proven by a regression that drives the real buildOrRestore.

Hard invariants intact: INV-01 (frozen registry hash unmoved; `mcp:capabilities-discover` OUT of TOOL_REGISTRY — `tool-definitions-parity` 256/0, `capability-mcp-surface` 19/0), INV-02 (`capability-autopilot-parity` 10/0), INV-04 (iterator byte-untouched — 4 setTimeout callsites, guard GREEN), origin-pin (learned recipes replay through executeBoundSpec which re-pins), recipe-path guard PASS (new modules eval-free + allowlisted), and NO manifest change (no Phase-31 commit touched extension/manifest.json). The mcp build exits 0 in the main tree.

The ONE outstanding item — the live end-to-end discovery loop on a real authenticated origin (UAT-31-01) — is irreducibly live, documented as `human_needed` debt in 31-HUMAN-UAT.md, and consistent with the Phase 27/28/29/30 live-UAT posture. Per the phase verification contract it does NOT block: status is `passed` with the live UAT recorded as human-verification debt.

---

_Verified: 2026-06-22_
_Verifier: Claude (gsd-verifier)_
