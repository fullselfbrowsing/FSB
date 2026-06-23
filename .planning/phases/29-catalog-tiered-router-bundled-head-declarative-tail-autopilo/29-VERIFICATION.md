---
phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
verified: 2026-06-21T21:10:22Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "A real T1a head handler returns LOGGED-IN data (not a login redirect) from a real HttpOnly-cookie site via the loaded extension"
    expected: "github.issues.list / slack.conversations.list / notion.getSpaces / reddit.inbox each return the logged-in-shape body against a live signed-in first-party tab; the [ASSUMED] internal endpoint paths are captured/confirmed in catalog/handlers/*.js + catalog/recipes/reddit-inbox.json"
    why_human: "Requires a live Chrome extension + a real authenticated first-party origin; cannot run in CI without shipping a real credential (forbidden, GOV-06). Recorded in 29-HUMAN-UAT.md (UAT-29-01..04), matching the Phase 27/28 live-UAT posture. Does NOT block the headless gate."
  - test: "Origin-pin holds LIVE on the T1a head path"
    expected: "With the active tab on a NON-matching origin, invoking any T1a head slug returns RECIPE_ORIGIN_MISMATCH (both code and errorCode) and fires NO request / NO executeScript side effect"
    why_human: "Requires a live extension + a real cross-origin active tab to exercise executeBoundSpec's active-tab re-pin against a live chrome.tabs.get. The headless equivalent (spec.origin != active-tab origin -> RECIPE_ORIGIN_MISMATCH, empty executeScript recorder) IS proven in capability-router.test.js. Recorded as 29-HUMAN-UAT.md UAT-29-05."
deferred:
  - truth: "Real learned recipes (T2) — discovery/synthesis/promotion feeding the router"
    addressed_in: "Phase 31"
    evidence: "ROADMAP Phase 31: Network-Capture Discovery + Recipe Synthesis + Learned Recipes. Phase 29 ships T2 as a typed RECIPE_LEARN_PENDING seam by locked decision D-07 (in scope as a seam, not a gap)."
  - truth: "Real self-healing DOM fallback (T3) — router calls executeTool() on recipe break and re-learns"
    addressed_in: "Phase 32"
    evidence: "ROADMAP Phase 32: Self-Healing Fallback + Recipe-Rot Detection. Phase 29 ships T3 as a typed RECIPE_DOM_FALLBACK_PENDING seam that does NOT call executeTool, by locked decision D-07 (in scope as a seam, not a gap)."
---

# Phase 29: Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity — Verification Report

**Phase Goal:** Add the catalog, the origin-biased tiered router, the zero-install bundled head (imperative handlers) and declarative-recipe long tail, and the autopilot branch — so MCP and autopilot share one engine (INV-02 at the runtime layer).
**Verified:** 2026-06-21T21:10:22Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal is achieved at the RUNTIME layer. All three ROADMAP success criteria are observably true in the codebase, the full headless `npm test` gate exits 0, the three hard invariants (INV-01/02/04) are confirmed unbroken, and the T2/T3 scope fences are genuine seams (not full implementations). The only outstanding items are the live-browser UAT scenarios — documented `human_needed` debt matching the Phase 27/28 posture — which do NOT block the headless gate.

### Observable Truths

Truths merge the 3 ROADMAP success criteria (non-negotiable contract) with the per-plan must_have truths.

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1 | **(SC-1, CAT-01/05)** A capability router selects a tier (T0→T1a→T1b→T2→T3), origin-biased, returning a structured result OR a typed reason | ✓ VERIFIED | `extension/utils/capability-router.js` `invoke()` switch (lines 194-215) dispatches each tier; `capability-router.test.js` 27/0 (tier order, T1b lifted path stamps tier:'T1b', origin bias picks owned-origin entry). Behavioral spot-check: real invocation returns RECIPE_NOT_FOUND/LEARN_PENDING/DOM_FALLBACK_PENDING. |
| 2 | **(SC-2, CAT-02)** 5-10 high-value services ship as bundled imperative handlers (zero-install head) | ✓ VERIFIED | `catalog/handlers/{github,slack,notion}.js` exist (8 T1a/T1b slugs across 4 services: github.notifications T1b, github.issues.list/create T1a, slack.conversations.list/chat.postMessage T1a, notion.getSpaces/loadPage T1a, reddit.inbox T1b). Runtime `seedHeadHandlers()` registers 6 T1a slugs + 2 T1b recipes. `capability-head-handlers.test.js` 54/0. |
| 3 | **(SC-2, CAT-03)** Additional services load as declarative recipes executed by the bundled interpreter (long tail) | ✓ VERIFIED | `catalog/recipes/reddit-inbox.json` (schema-valid: www.reddit.com /message/unread.json GET same-origin-cookie) + github-notifications.json T1b. Router T1b tier routes via lifted interpretRecipe→executeBoundSpec (`_runDeclarativeTier`, lines 95-143). `capability-recipe-schema.test.js` 43/0. |
| 4 | **(SC-3, CAT-04/INV-02)** Autopilot reaches the SAME engine via a tool-executor branch — no parallel stack | ✓ VERIFIED | `extension/ai/tool-executor.js:741-742` guard returns `executeCapabilityToolForAutopilot` BEFORE `_te_getToolByName` (line 745); the branch calls `globalThis.FsbCapabilityRouter.invoke` (line 695) — same global the MCP dispatcher calls. `capability-autopilot-parity.test.js` 10/0 spies the global, confirms BOTH front doors hit it with same slug+args. |
| 5 | **(CAT-05)** Router returns a typed reason matching /^RECIPE_.+$/ (RECIPE_NOT_FOUND / RECIPE_LEARN_PENDING / RECIPE_DOM_FALLBACK_PENDING) | ✓ VERIFIED | `_err()` (line 61-69) sets dual-field {code,errorCode,error}. Behavioral spot-check confirmed all three reasons at runtime, all match /^RECIPE_.+$/, dual-field. `mapFSBError` passthrough proven in capability-router.test.js + capability-mcp-surface.test.js (no errors.ts edit). |
| 6 | **(CAT-04)** Capability tools stay OUTSIDE TOOL_REGISTRY; getPublicTools() omits them; frozen hash unmoved (INV-01) | ✓ VERIFIED | Tools register via `server.tool()` (`mcp/src/tools/capabilities.ts:41`), not TOOL_REGISTRY. `tool-definitions-parity.test.js` 256/0; `capability-mcp-surface.test.js` 19/0 asserts EXPECTED_NON_TRIGGER_REGISTRY_HASH unchanged + both names absent from TOOL_REGISTRY. getPublicTools maps `_al_TOOL_REGISTRY` only (agent-loop.js:674). |
| 7 | **(INV-04)** agent-loop.js setTimeout iterator stays byte-untouched; only an additive prompt hint added | ✓ VERIFIED | `agent-loop-iterator-guard.test.js` 4/0: the 100ms/5000ms/2000ms setTimeout lines present byte-unchanged, exactly 4 callsites. System-prompt hint added at agent-loop.js:731 (names search_capabilities + invoke_capability). |
| 8 | **(CAT-04, D-03)** MCP reroute: handleCapabilitiesInvokeMessageRoute calls FsbCapabilityRouter.invoke; route table + wire names byte-unchanged | ✓ VERIFIED | mcp-tool-dispatcher.js:2235 single `FsbCapabilityRouter.invoke(payload.slug, payload.params||{}, {origin, tabId})` call; zero inline executeBoundSpec/interpretRecipe in handler body (lines 2208-2236). Route table mcp:capabilities-invoke/-search byte-unchanged (lines 113-114). |
| 9 | **(CAT-02, pin)** Each T1a handler calls ctx.executeBoundSpec — never chrome.scripting — so origin-pin holds on the head path | ✓ VERIFIED | All 3 handlers call ctx.executeBoundSpec; zero chrome.scripting/chrome.tabs refs (grep across all). github CSRF probe + slack xoxc probe return verbatim on probe.success===false before mutating. capability-router.test.js proves spec.origin != active-tab → RECIPE_ORIGIN_MISMATCH with EMPTY executeScript recorder. |
| 10 | **(CAT-02, D-09)** Each handler targets its OWN first-party origin, never a separate API origin | ✓ VERIFIED | github.com / app.slack.com / www.notion.so / www.reddit.com hardcoded. Zero occurrences of api.github.com / oauth.reddit.com / api.notion.com / api.slack.com in any handler or recipe. |
| 11 | **(D-01, Wall-1)** Router + catalog are eval-free dual-export IIFE SW modules on RECIPE_PATH_ALLOWLIST; handlers eval-free + on allowlist | ✓ VERIFIED | Router/catalog: 0 eval/new Function/import( (router also 0 chrome./fetch(). Allowlist has capability-router.js, capability-catalog.js + all 3 handlers (lines 112-126). `verify-recipe-path-guard.mjs` PASS (13 files clean; Check 5 handler disk-drift fails closed — MED-01 resolution). |
| 12 | **(D-12, importScripts)** SW loads catalog then router after capability-search.js; handlers loaded then seedHeadHandlers() runs | ✓ VERIFIED | background.js load order: capability-search (155) → capability-catalog (173) → capability-router (174) → handlers github/slack/notion (185-187) → seedHeadHandlers() (191). Additive try/catch importScripts. |
| 13 | **(scope fence, D-07)** T2 is a no-op stub and T3 is a typed seam that does NOT call executeTool() | ✓ VERIFIED | Router T2 case (line 206) returns _err('RECIPE_LEARN_PENDING') only; T3 case (line 211) returns _err('RECIPE_DOM_FALLBACK_PENDING') only — no executeTool, no chrome.scripting, no next-tier call. capability-router.test.js proves the T3 seam fires NO executeScript (empty recorder). In-scope incompleteness, not a gap. |

**Score:** 13/13 truths verified

### Deferred Items

Items intentionally scoped to later milestone phases (locked decision D-07). NOT actionable gaps.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Real learned recipes (T2) | Phase 31 | ROADMAP Phase 31 (DISC/LEARN). Phase 29 ships T2 as the RECIPE_LEARN_PENDING typed seam (D-07). |
| 2 | Real self-healing DOM fallback (T3) | Phase 32 | ROADMAP Phase 32 (HEAL). Phase 29 ships T3 as the RECIPE_DOM_FALLBACK_PENDING typed seam that does NOT call executeTool (D-07). |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `extension/utils/capability-router.js` | Tier dispatch + typed fall-through | ✓ VERIFIED | 228 lines; invoke() switch over T0/T1a/T1b/T2/T3; pure (no chrome./fetch/eval); dual-export IIFE; on allowlist; WIRED via background.js + both front doors. |
| `extension/utils/capability-catalog.js` | slug→{tier,handler\|recipe,descriptor} registry; resolve() | ✓ VERIFIED | 282 lines; resolve/registerHandler/seedHeadHandlers/biasByOwnedOrigin; eval-free; WIRED via background.js + router._catalog(). |
| `catalog/handlers/github.js` | github.issues.* T1a (persisted-query + CSRF scrape) | ✓ VERIFIED | 191 lines; list (read) + create (write); from:'response' CSRF; token in header only, never logged; first-party origin; self-registers. |
| `catalog/handlers/slack.js` | slack.* T1a (xoxc body + xoxd cookie split-token) | ✓ VERIFIED | xoxc placed in BODY (token=...), not a header; xoxd rides same-origin; conversations.list (read) + chat.postMessage (write); no token logging. |
| `catalog/handlers/notion.js` | notion.* T1a (/api/v3 RPC) | ✓ VERIFIED | getSpaces + loadPage; POST /api/v3; token_v2 cookie same-origin; www.notion.so; calls ctx.executeBoundSpec. |
| `catalog/recipes/reddit-inbox.json` | reddit.inbox T1b same-origin recipe | ✓ VERIFIED | Schema-valid: www.reddit.com, /message/unread.json, GET, same-origin-cookie, extract '@'. |
| `tests/capability-router.test.js` | CAT-01/02/03/05 surface | ✓ VERIFIED | 27/0; tier order, origin bias, T1a dispatch+pin, T1b lifted path, typed reasons, T3-no-exec, LOW-01 fail-closed. IN npm test chain. |
| `tests/capability-autopilot-parity.test.js` | CAT-04 one-engine-two-doors + out-of-registry | ✓ VERIFIED | 10/0; both front doors call same global; result-shape identity; tools out-of-registry; hash unmoved. IN npm test chain. |
| `tests/agent-loop-iterator-guard.test.js` | INV-04 byte guard | ✓ VERIFIED | 4/0; 3 iterator lines byte-unchanged, exactly 4 callsites. IN npm test chain. |
| `tests/capability-head-handlers.test.js` | Per-handler behavioral gate (pin, xoxc-body, no-token-log) | ⚠️ ORPHANED (from CI) | Exists (54/0 standalone) but NOT appended to npm test chain — see WARNING below. |
| `scripts/package-extension.mjs` | Ship handlers into package | ✓ VERIFIED | Lines 91-115 copy catalog/handlers/*.js into extension/catalog/handlers/ (absent-dir-tolerant). |
| `scripts/verify-recipe-path-guard.mjs` | Allowlist + eval-free guard | ✓ VERIFIED | Router/catalog/3-handlers on allowlist; Check 5 handler disk-drift fails closed; PASS. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| handleCapabilitiesInvokeMessageRoute | FsbCapabilityRouter.invoke | single internal reroute | ✓ WIRED | mcp-tool-dispatcher.js:2235; no inline primitive remains; route table unchanged. |
| executeTool (pre-_te_getToolByName) | executeCapabilityToolForAutopilot → globalThis.FsbCapabilityRouter.invoke | CAPABILITY_TOOL_NAMES guard | ✓ WIRED | tool-executor.js:741-742 guard BEFORE registry lookup (745); branch hits same global (695). |
| capability-router.js | FsbCapabilityFetch.executeBoundSpec | typeof-guarded global, T0/T1b/T1a | ✓ WIRED | _runDeclarativeTier line 135; _runHandlerTier passes executeBoundSpec into handler ctx (164). |
| capability-catalog.js | FsbCapabilitySearch.getRecipeBySlug | T1b recipe source (D-04) | ✓ WIRED | _getRecipeBySlug (54-60) typeof-guarded; inline recipe fallback. |
| catalog/handlers/*.js | ctx.executeBoundSpec | handler never calls chrome.scripting | ✓ WIRED | All 3 handlers; pin lives in executeBoundSpec; verified zero chrome.scripting/tabs. |
| FsbCapabilityCatalog | catalog/handlers (T1a entries) | registerHandler + seedHeadHandlers | ✓ WIRED | background.js seedHeadHandlers() at startup (191); runtime check: 6 T1a slugs register. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| capability-router.js invoke() | entry (catalog), out (executeBoundSpec) | FsbCapabilityCatalog.resolve + FsbCapabilityFetch.executeBoundSpec | ✓ (typed reasons + real spec dispatch confirmed at runtime) | ✓ FLOWING — behavioral spot-check produced the 3 typed reasons; T1b test fired a real world:MAIN executeScript via the primitive. |
| catalog/handlers/*.js handle() | spec → ctx.executeBoundSpec result | the MAIN-world credentialed fetch primitive | ⚠️ [ASSUMED] endpoint PATHS pending live capture | ⚠️ STATIC-on-the-wire — handler architecture (origin-pin, executeBoundSpec, CSRF/xoxc flow) is REAL; the internal endpoint paths are [ASSUMED] placeholders confirmed live in 29-HUMAN-UAT.md. This is documented debt, not a gap. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Router produces RECIPE_NOT_FOUND for unknown slug | node real invoke | RECIPE_NOT_FOUND, dual-field, /^RECIPE_.+$/ | ✓ PASS |
| T2 entry → RECIPE_LEARN_PENDING (no exec) | node real invoke | RECIPE_LEARN_PENDING | ✓ PASS |
| T3 entry → RECIPE_DOM_FALLBACK_PENDING (no exec) | node real invoke | RECIPE_DOM_FALLBACK_PENDING | ✓ PASS |
| Catalog resolves seeded T1b slugs | node cat.resolve | github.notifications/reddit.inbox → T1b; unknown → null | ✓ PASS |
| seedHeadHandlers registers T1a head | node seedHeadHandlers | 6 T1a slugs, handlers present, correct origins | ✓ PASS |
| Module exports | node require | router.invoke / catalog.* / executeCapabilityToolForAutopilot all functions | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Recipe-path supply-chain guard | `node scripts/verify-recipe-path-guard.mjs` | PASS (13 files clean, 3 handlers on allowlist) | ✓ PASS |
| capability-router | `node tests/capability-router.test.js` | 27 passed, 0 failed | ✓ PASS |
| capability-autopilot-parity | `node tests/capability-autopilot-parity.test.js` | 10 passed, 0 failed | ✓ PASS |
| agent-loop-iterator-guard (INV-04) | `node tests/agent-loop-iterator-guard.test.js` | 4 passed, 0 failed | ✓ PASS |
| capability-head-handlers | `node tests/capability-head-handlers.test.js` | 54 passed, 0 failed | ✓ PASS |
| capability-mcp-surface (INV-01) | `npm --prefix mcp run build && node tests/capability-mcp-surface.test.js` | 19 passed, 0 failed | ✓ PASS |
| tool-definitions-parity (INV-01) | `node tests/tool-definitions-parity.test.js` | 256 passed, 0 failed | ✓ PASS |
| capability-recipe-schema | `node tests/capability-recipe-schema.test.js` | 43 passed, 0 failed | ✓ PASS |
| Full headless phase-close gate | `npm test` | exit 0, zero FAIL lines | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| CAT-01 | 29-01, 29-02, 29-04 | Capability router selects a tier, origin-biased | ✓ SATISFIED | Truths 1, 13; capability-router.test.js tier order + origin bias. |
| CAT-02 | 29-01, 29-03 | 5-10 services as bundled imperative handlers (zero-install head) | ✓ SATISFIED (CI half); live capture human_needed | Truths 2, 9, 10; 8 slugs/4 services; head-handlers 54/0. Live logged-in-shape = 29-HUMAN-UAT.md (Phase 27/28 posture). |
| CAT-03 | 29-01, 29-02, 29-03 | Additional services as declarative recipes via the interpreter | ✓ SATISFIED | Truth 3; reddit-inbox.json schema-valid; T1b lifted path. |
| CAT-04 | 29-01, 29-05 | Autopilot reaches the same engine via tool-executor branch (INV-02) | ✓ SATISFIED | Truths 4, 6, 8; parity test 10/0 both doors → same global. |
| CAT-05 | 29-01, 29-02, 29-04 | Router returns structured result OR typed reason | ✓ SATISFIED | Truths 1, 5; 3 typed reasons confirmed at runtime, all /^RECIPE_.+$/. |

No orphaned requirements: REQUIREMENTS.md maps exactly CAT-01..05 to Phase 29; every ID is claimed by ≥1 plan and every plan-claimed ID belongs to Phase 29.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| catalog/handlers/{github,slack,notion}.js | various | `[ASSUMED-ENDPOINT: capture live in 29-03 Task 4]` | ℹ️ Info | References formal follow-up (29-03 Task 4 / 29-HUMAN-UAT.md) — auditable, scoped, EXPECTED debt per RESEARCH A2/A3/A4. NOT an unreferenced debt marker. |

No TBD/FIXME/XXX markers in any phase-modified source. No TODO/HACK/PLACEHOLDER. No hardcoded secrets (only `*-TEST-SYNTHETIC` fixtures in the test file). No empty/stub implementations on the credentialed path.

### Human Verification Required

The live half of the bundled head is irreducibly live and cannot run in CI without shipping a real credential (forbidden, GOV-06). It is documented `human_needed` in `29-HUMAN-UAT.md`, matching the Phase 27/28 live-UAT posture, and does NOT block the headless gate (which is green).

#### 1. Bundled-head logged-in-shape live capture (UAT-29-01..04)

**Test:** Load the unpacked extension; for each head service (GitHub issues, Slack, Notion, Reddit inbox) sign in to the first-party origin, keep that tab active, invoke the head slug via the autopilot or MCP front door, and in DevTools capture the REAL internal request to confirm/correct the `[ASSUMED]` endpoint paths in catalog/handlers/*.js + catalog/recipes/reddit-inbox.json.
**Expected:** Each returns the LOGGED-IN body shape (real data, not a /login redirect); the `[ASSUMED]` endpoint path / CSRF or token carrier / request body either matches or is replaced with the captured real value.
**Why human:** Requires a live Chrome extension + a real authenticated first-party session; cannot ship a real credential to CI.

#### 2. Origin-pin live on the head path (UAT-29-05)

**Test:** Put the active tab on a NON-matching origin and invoke any T1a head slug (e.g. slack.conversations.list with the active tab on github.com).
**Expected:** RECIPE_ORIGIN_MISMATCH (both code and errorCode); NO request fired, NO executeScript side effect.
**Why human:** Exercises executeBoundSpec's live active-tab re-pin via a real chrome.tabs.get. The headless equivalent IS proven (capability-router.test.js: spec.origin != active-tab → RECIPE_ORIGIN_MISMATCH, empty executeScript recorder).

### Gaps Summary

No blocking gaps. All 13 must-have truths are VERIFIED in the codebase; the full headless `npm test` gate exits 0; the three hard invariants (INV-01 frozen hash unmoved, INV-02 one-engine-two-doors, INV-04 iterator byte-untouched) are confirmed unbroken; and the T2/T3 scope fences are genuine typed seams that do not execute (in-scope incompleteness, deferred to Phases 31/32). The only outstanding items are the live-browser UAT scenarios, which are documented `human_needed` debt (29-HUMAN-UAT.md) matching the Phase 27/28 posture — they do not block the headless gate. Status is `human_needed` rather than `passed` solely because the verification process surfaces these live items for human testing (Step 9 decision tree: human items take priority over passed).

#### WARNING (non-blocking): head-handlers behavioral test not wired into `npm test`

`tests/capability-head-handlers.test.js` (54/0 standalone, an executor-added test from Plan 03) is NOT appended to the `package.json` `scripts.test` chain. Its specific source-level security assertions (Slack xoxc-in-body, no-token-logging, no separate-origin host) therefore run only when invoked directly, not as part of the automated regression gate.

- **Why this is a WARNING, not a BLOCKER:** No must_have or ROADMAP success criterion requires this test in the chain (no PLAN references it as a chain entry). The implementation is correct (verified here + in 29-REVIEW.md). The security-critical handler properties ARE gated in CI by other in-chain/validation commands: `verify-recipe-path-guard.mjs` (handler eval-free + on-allowlist, Check 1 grep + Check 5 disk-drift; runs in `validate:extension`) and `capability-router.test.js` (T1a dispatch + origin-pin RECIPE_ORIGIN_MISMATCH with empty executeScript recorder; runs in `npm test`).
- **Recommendation (human decision):** Append `&& node tests/capability-head-handlers.test.js` to `package.json` `scripts.test` so the xoxc-in-body / no-token-logging assertions regress automatically. Low effort; closes the only uncovered-in-chain test layer.

---

_Verified: 2026-06-21T21:10:22Z_
_Verifier: Claude (gsd-verifier)_
