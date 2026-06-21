---
gsd_state_version: 1.0
milestone: v0.9.99
milestone_name: Native Capability Catalog (FSB API Execution)
status: ready_to_plan
stopped_at: Phase 29 complete (5/5) — ready to discuss Phase 999.1
last_updated: 2026-06-21T21:14:31.197Z
last_activity: 2026-06-21
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 15
  completed_plans: 17
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (v0.9.99 Native Capability Catalog milestone framing + INV-01..04)
See: .planning/ROADMAP.md (active milestone v0.9.99, Phases 26-32)
See: .planning/REQUIREMENTS.md (44 v1 requirements across 9 categories; 44/44 mapped, 0 unmapped)
See: .planning/research/SUMMARY.md (decision-ready synthesis; risk-first 7-phase ordering)
See: .planning/MILESTONES.md (prior milestones; v0.12.0 ended at Phase 25)

**Core value:** Reliable single-attempt execution — the AI decides correctly, the mechanics execute precisely. v0.9.99 extends this to a second execution path: call a service's real web API through the user's authenticated session (fast path), self-healing to DOM automation when the API path breaks.
**Current focus:** Phase 999.1 — mcp tool gaps click heuristics

## Current Position

Phase: 999.1
Plan: Not started
Status: Ready to plan
Last activity: 2026-06-21

Progress: [██████████] 100%

## Roadmap At A Glance (v0.9.99, Phases 26-32)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 26 | Recipe Schema + Bundled Interpreter + MV3 CI Guard | CAP-01..05 (5) | Complete — all 3 plans done (CAP-01..05); ready for verification |
| 27 | Authenticated Fetch Primitive (MAIN-world) + Origin-Pin + Resume-Sidecar | FETCH-01..05 (5) | Complete — all 3 plans done (FETCH-01..05; CI half green); live FETCH-05 logged-in-shape is human_needed UAT debt; ready for verification |
| 28 | Lean MCP Surface + Capability Search + Eval Harness | SURF-01..06 (6) | Not started |
| 29 | Catalog + Tiered Router + Bundled Head + Declarative Tail + Autopilot Parity | CAT-01..05 (5) | Not started |
| 30 | Consent Governance + Recipe Signature Verification + Audit + Legal Posture | GOV-01..08, SIGN-01..02 (10) | Not started |
| 31 | Network-Capture Discovery + Recipe Synthesis + Learned Recipes | DISC-01..04, LEARN-01..04 (8) | Not started |
| 32 | Self-Healing Fallback + Recipe-Rot + Re-Learn + Provider/Schema-Lock Tests + UAT | HEAL-01..05 (5) | Not started |

Coverage: 44/44 v1 requirements mapped, 0 orphaned.

Ordering principle (risk-first, all four researchers converge): Wall 1 (schema/CI guard) and Wall 2 (page-context fetch) are de-risked first; search needs invoke to exist; tiering + the autopilot path need one front door proven; consent must precede any auto/learning; discovery needs consent + memory + router to consume what it learns; self-heal needs the full stack.

## Hard Invariants (bind every phase)

- **INV-01:** existing ~63 MCP tool schemas stay byte-identical; the 2 new tools (`search_capabilities`, `invoke_capability`) register OUTSIDE `TOOL_REGISTRY` via `server.tool()`. (Schema-lock test green is the Phase 32 gate.)
- **INV-02:** autopilot reaches the capability engine via a `tool-executor` branch hitting the SAME `capability-router`; no parallel autopilot-only stack (runtime-layer parity, Phase 29).
- **INV-03:** capability + fallback paths work equally across all 7 `universal-provider.js` targets (cross-provider test gate is Phase 32).
- **INV-04:** the `agent-loop.js` `setTimeout`-chained iterator is load-bearing and untouched; invoke is a single bounded async op.

## Architectural Walls (non-negotiable, shape every phase)

- **Wall 1 (MV3 no remotely-hosted code):** server-delivered recipes are CLOSED-vocabulary DATA bound by a fixed bundled interpreter — never `eval`'d, never grown into server-authored control flow. CI guard fails on `eval`/`new Function`/`import(` reachable from the recipe path.
- **Wall 2 (execution context):** the authenticated fetch MUST run in the page MAIN world (existing `execute_js` seam) so first-party HttpOnly/SameSite cookies attach; a background-SW `fetch()` is the anti-pattern. CDP Network is discovery-only, never the invoke transport.

## Performance Metrics

**Velocity:**

- Total plans completed (this milestone): 4
- Most recent completed milestone: v0.12.0 PhantomStream Package Migration (5 phases, 19 plans; live Chrome-extension UAT user-gated).

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 26 | 3 | - | - |
| 27 | 3 | - | - |
| 28 | 4 | - | - |
| 29 | 5 | - | - |

*Updated after each plan completion.*
| Phase 27 P02 | 7min | 3 tasks | 7 files |
| Phase 27 P03 | 3min | 2 tasks | 1 files |
| Phase 28 P28-01 | 8min | 4 tasks | 11 files |
| Phase 28 P28-02 | 7min | 2 tasks | 4 files |
| Phase 28 P28-03 | 3min | 2 tasks | 2 files |
| Phase 28 P28-04 | 9min | 2 tasks | 3 files |
| Phase 29 P01 | 6min | 3 tasks | 6 files |
| Phase 29 P02 | 5min | 3 tasks | 3 files |
| Phase 29 P04 | 4min | 1 tasks | 1 files |
| Phase 29 PP03 | 9min | 4 tasks tasks | 12 files files |
| Phase 29 P05 | 7min | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md. Carried-forward invariants binding this milestone are INV-01..04 (above) plus the two architectural walls.

**Phase 26 Plan 01 (CAP-01, CAP-05):**

- `@cfworker/json-schema` IIFE-bundled (not vendored raw) because a top-level import/export is a SyntaxError under `importScripts` in a classic service worker — the durable runtime reason, independent of the Node-version-fragile `node --check` rationale in D-02. `minisearch`/`jmespath` vendor as-is (already UMD).
- `validateRecipe` error-mapping order classifies `schemaVersion` const and `method`/`authStrategy` enum failures BEFORE the generic `additionalProperties` check, because `@cfworker/json-schema@4.1.1` emits a root `additionalProperties` error alongside enum/const failures (verified live). The RESEARCH example's order would mis-report a bad enum as `RECIPE_UNKNOWN_FIELD`.
- Forbidden script-like names (script/expr/transform/code/fn/js) rejected by a top-level pre-scan that names the offending field (additionalProperties:false alone yields a generic location — Pitfall 2).
- `authStrategy` enum locked at four members (D-08); `format:'uri'` on `origin` only, leading-slash `pattern` on `endpoint` (Pitfall 4). Fixtures live at repo-root `catalog/recipes/_fixtures/` (not node --check'd; test data, not shipped runtime).
- Recipe-path source files kept free of dynamic-code substrings even in comments, pre-satisfying the Plan 03 CI-guard allowlist scan.

**Phase 26 Plan 02 (CAP-02, CAP-03):**

- The interpreter REUSES Plan 01's `validateRecipe` as the recipe-schema gate (no re-implementation) and delegates step 1, inheriting the typed `RECIPE_*` codes (incl. the Plan 01 enum mapping-order fix); it focuses on bind+emit. Invoke args are validated against `recipe.params` only when that optional, intentionally-open sub-document is present, via a fresh `CfworkerJsonSchema.Validator(recipe.params,'2020-12',false)` -> `RECIPE_SCHEMA_INVALID` before binding.
- Auth binding is a frozen `Object.freeze` registry keyed exactly by the four `authStrategy` enum members; each handler is a spec-shaping STUB returning a NEW spec (credentials / `_authNeed` / `csrfSource`) with zero I/O (D-12). `bindAuthStrategy` rejects an unknown strategy with `RECIPE_OPCODE_INVALID` (defense-in-depth beyond the schema enum).
- The bound spec carries `extract` UNEVALUATED (D-14; jmespath reached only via `getFSBJmespath()`, never run in Phase 26) plus a resolved `query` placement map for Phase 27. The hand-rolled `{var}` templater (D-04) encodeURIComponent-escapes every param and rejects unfilled placeholders (no template injection).
- The load-bearing Phase 26/27 boundary is proven at runtime: the interpreter test asserts `chrome.scripting.executeScript` AND `globalThis.fetch` are each called 0 times across the whole suite.
- `mcp/src/errors.ts` gained `RECIPE_.+` in the verbatim-passthrough regex (one-line; INV-01 honored, no tool schema touched); the `RECIPE_*` codes surface verbatim (not `action_rejected`), proven against the built mcp module. The interpreter + auth-strategies files are free of `eval`/`new Function`/`import(`/`fetch`/`chrome.scripting` even in comments, pre-staging the Plan 03 allowlist.
- [Phase ?]: Phase 26 Plan 03 (CAP-04): the recipe-path CI guard scans an EXPLICIT hardcoded six-file allowlist (the 3 capability modules + the 3 vendored libs) for eval/new Function/import(, NOT a whole-extension grep (D-17) -- a broad grep would false-positive on FSB's three sanctioned MAIN-world execute_js sites (tool-executor.js, mcp-bridge-client.js, lattice-runtime-adapter.js).
- [Phase ?]: Phase 26 Plan 03 (CAP-04): the guard uses PRECISE word-boundary forbidden patterns so the minified vendored libs do not false-positive on innocent substrings (retrieval/evaluate/important); a NEGATIVE self-assertion proves the three sanctioned sites are NOT on the allowlist; a test-only FSB_RECIPE_GUARD_EXTRA_ALLOWLIST env seam lets the spawn test plant an eval file and assert exit non-zero.
- [Phase ?]: Phase 26 Plan 03 (CAP-04): the guard is chained into npm run validate:extension per D-18 -- runs in the existing CI extension job before npm test and feeds ci/all-green with NO ci.yml edit (verified empty diff). It ALSO runs RECIPE_SCHEMA against catalog/recipes/_fixtures (valid-* accepted, reject-* rejected) as a build-time closed-vocabulary proof.

**Phase 27 Plan 01 (FETCH-03, FETCH-04):**

- `interpretRecipe` now folds `spec.query` into the URL (D-09) BEFORE re-asserting the origin-pin (D-08 part 1) against the EFFECTIVE post-fold target, filling the pre-flagged assembly slot. A cross-origin OR protocol-relative effective target returns the new typed `RECIPE_ORIGIN_MISMATCH` (BOTH `code` and `errorCode`) before any side effect; `spec.url` then carries the true effective request target. Folded query VALUES are not re-encoded (already escaped by buildRequest) -- only the key is encoded (T-27-04 accepted non-issue). No errors.ts edit for `RECIPE_ORIGIN_MISMATCH` -- the existing `/RECIPE_.+/` passthrough surfaces it. The no-network charter (26-D-11) is preserved and re-proven (executeScript/fetch 0-call assertions green, including the new rejection cases).
- Test reachability: because the recipe schema gates `endpoint` to a single-leading-slash non-protocol-relative path and buildRequest escapes every query value, a SCHEMA-VALID recipe can only ever fold to a slash-rooted same-origin URL -- so the interpreter pin is defense-in-depth. The genuine reachable cross-origin/protocol-relative effective target is a single-leading-slash endpoint whose next character(s) are backslashes (one backslash resolves to https://evil.com; two resolves to a protocol-relative //evil.com): schema-valid (the leading-double-slash guard does not match), but the WHATWG URL parser normalizes the backslash to a slash and re-targets the host. This is exactly the effective-target escape the pin exists to catch.
- `RECOVERY_AMBIGUOUS` registered in `CODE_ONLY_ERROR_KEYS` (single-token Set add, cleaner than extending the resolveErrorKey regex; INV-01-safe, no MCP tool schema touched) and verified present in the built `mcp/build/errors.js` after `npm --prefix mcp run build` (FETCH-04 surfacing prerequisite). `extension/utils/capability-fetch.js` registered on `RECIPE_PATH_ALLOWLIST` ahead of its Plan 02 creation.
- [Rule 3 deviation]: the recipe-path guard's Check 1 called `safeRead` on every allowlist path, which PUSHES an ENOENT failure for a not-yet-existent file -- contrary to the plan's premise that an absent path is skipped silently, so registering the absent capability-fetch.js made the guard FAIL. Fix: an `existsSync` pre-check at the top of Check 1 skips a registered-but-absent recipe-path file WITHOUT recording a failure (an absent file cannot contain forbidden code). The present-file scan still flags planted-eval, and Check 4 (disk-drift) still fails on any on-disk capability module missing from the allowlist; recipe-path-guard.test.js stays green.
- [Phase 27]: Phase 27 Plan 03 (FETCH-05 live half): the live logged-in-shape assertion (real GitHub HttpOnly _gh_sess/logged_in cookies attach in the page MAIN world -> a logged-in, not logged-out, body shape) is recorded as a human_needed UAT (27-HUMAN-UAT.md UAT-27-01: HTTP 200 not 302 to /login AND/OR a non-empty user-login meta) and accepted in auto-mode as documented live-browser UAT debt -- NOT a fabricated pass (D-14, D-15, T-27-12). FETCH-05's automated/CI half (the smoke test asserting the logged-in shape through the chosen execution context, stubbed seam) was proven green in Plan 02 (tests/capability-fetch.test.js); CI green does not depend on the live half. This plan introduces no code, build, or package change -- it authors one markdown doc and gated a checkpoint.
- [Phase ?]: Phase 28 Plan 01 (SURF-04/06/01): capability-search.js uses one module-level INDEX_OPTIONS reused at new MiniSearch + loadJSON(JSON.stringify(toJSON()), INDEX_OPTIONS) and exported so the eval test shares it (no options drift); loadJSON throws without matching options.
- [Phase ?]: Phase 28 Plan 01: the eval gate (recall@5>=0.9 AND wrong-invoke=0, D-13) is provably non-trivial -- a naive description-only index scores wrong-invoke=0.222 on the near-neighbor seed and fails; the tuned intentSynonyms boost is load-bearing (D-14).
- [Phase ?]: Phase 28 Plan 01: catalogVersion is a djb2 content hash over sorted descriptor slugs + recipe count; catalog ships via a build-time generated FsbRecipeIndex IIFE (extension/catalog/recipe-index.generated.js, gitignored, regenerated by package-extension.mjs) loaded at SW startup (D-16).
- [Phase ?]: Phase 28 Plan 01: buildIndex cross-checks the authored descriptor sideEffectClass against the recipe method-derived class (recipe wins) so a mis-authored descriptor cannot under-state a destructive search hit (D-02).
- [Phase 28]: Plan 02 (SURF-03/05/01/02): search_capabilities + invoke_capability register via server.tool() OUTSIDE TOOL_REGISTRY in capabilities.ts (vault.ts precedent) -- the INV-01 seam; the frozen tool-definitions-parity hash is unmoved (65 tools on the wire, registry unchanged).
- [Phase 28]: Plan 02: the SURF-05 read-only/queued split lives entirely in queue.ts readOnlyTools -- search_capabilities is a member (bypass, like search_memory), invoke_capability is NOT (serialized, like fill_credential); both still wrap in queue.enqueue.
- [Phase 28]: Plan 02: bridge wire names mcp:capabilities-search (read-only) / mcp:capabilities-invoke (queued) added to the MCPMessageType union (Rule 3 type wiring; no TOOL_REGISTRY/tool-definitions edit) -- the exact routes Plan 03's SW dispatcher will register; invoke_capability uses a generic {slug,params?,tab_id?} zod shape (per-recipe validation is SW-side in interpretRecipe).
- [Phase ?]: Phase 28 Plan 03 (SURF-01/SURF-02): two SW dispatcher routes (mcp:capabilities-search read-only, mcp:capabilities-invoke queued) + bridge delegates wire the capability tools; search resolves the un-spoofable owned-tab origin SW-side (new URL(tab.url).origin, D-11; payload.origin is a non-authoritative override) and returns <=5 ranked schema-on-hit hits.
- [Phase ?]: Phase 28 Plan 03: invoke is the routerless direct Phase-27 path (NO Phase-29 router): slug -> getRecipeBySlug -> interpretRecipe -> executeBoundSpec; UNGATED (consent is Phase 30) but the two-point origin-pin holds (executeBoundSpec re-asserts tabOrigin === spec.origin); unknown slug returns RECIPE_NOT_FOUND (dual-field) verbatim via the existing errors.ts /^RECIPE_.+$/ passthrough -- NO errors.ts edit (D-06/D-07).
- [Phase ?]: Phase 28 Plan 03: bridge delegates are pure pass-throughs (no origin/tab resolution) -- authoritative resolution lives ONLY in the dispatcher handlers (single un-spoofable point, T-28-01); both routes use the standalone handler: form (mcp:search-memory precedent), handlers are hoisted async function declarations referenced by the route-table const literal.
- [Phase ?]: [Phase 28] Plan 04 (SURF-03/05/02): tests/capability-mcp-surface.test.js is the single-file INV-01 proof -- enumerates the built runtime server._registeredTools (65 = 63 + 2, both capability tools on the wire, the Plan 02 probe) ADJACENT to a recompute of registryHash(nonTriggerTools) == the frozen EXPECTED_NON_TRIGGER_REGISTRY_HASH (out-of-registry, unmoved); queue split asserted structurally (readOnlyTools Set) AND behaviorally (search bypasses a slow in-flight invoke); RECIPE_NOT_FOUND surfaces verbatim (not action_rejected) via the existing /^RECIPE_.+$/ passthrough, no errors.ts edit.
- [Phase ?]: [Phase 28] Plan 04: both new phase tests (capability-search-eval + capability-mcp-surface) appended to the npm test chain after capability-fetch (no reorder/removal); the FULL npm test phase-close gate exits 0 after a Rule 1 fix to a stale lattice-provider-bridge-smoke importScripts baseline (168->170 / 164->166) left by Plan 28-01.
- [Phase ?]: Phase 29 Plan 02 (CAT-01/03/05): capability-router.js + capability-catalog.js as two pure dual-export IIFE SW modules. Catalog = authoritative slug->tier registry (resolve declares the explicit tier; a slug is EITHER T1a OR T1b, no runtime tie-break). Router invoke(slug,args,{origin,tabId}) dispatches T0/T1a/T1b/T2/T3: T1b/T0 = the verbatim-lifted routerless body (interpretRecipe -> executeBoundSpec, tier-stamped); T1a = handler.handle(args,ctx) with ctx.executeBoundSpec; T2 -> RECIPE_LEARN_PENDING (Phase 31 stub); T3 -> RECIPE_DOM_FALLBACK_PENDING (Phase 32 seam, NO executeTool/page injection); unknown -> RECIPE_NOT_FOUND. All reasons use createRecipeError dual-field shape, surface verbatim via /^RECIPE_.+$/ (no errors.ts edit). Router is PURE (no chrome./fetch), never re-targets -- origin-pin holds inside executeBoundSpec (D-12). Origin bias lives in the catalog (biasByOwnedOrigin owned-first), never re-tiers a known slug. tests/capability-router.test.js GREEN 24/24, zero edits to the Plan-01 RED file; INV-01 surface unmoved.
- [Phase ?]: Phase 29 Plan 04 (CAT-01/CAT-05): the D-03 internal-only reroute -- handleCapabilitiesInvokeMessageRoute (mcp-tool-dispatcher.js) now collapses to ONE FsbCapabilityRouter.invoke(slug, params, {origin, tabId}) call (the shared engine, front door 1 of INV-02). The inline getRecipeBySlug -> interpretRecipe -> executeBoundSpec body is gone (it lives in the router's T1b tier). Engine guard swapped to the router-unavailable guard. tabId + owned-tab origin resolved SW-side in one chrome.tabs.query (payload.tab_id/origin non-authoritative overrides, D-11); the two-point origin-pin still holds in executeBoundSpec. Wire names + MCP_PHASE199_MESSAGE_ROUTES + TOOL_REGISTRY byte-unchanged -> frozen INV-01 hash unmoved; no errors.ts edit (RECIPE_* verbatim). capability-mcp-surface 19/0, capability-router 24/0.
- [Phase 29]: Phase 29 Plan 03 (CAT-02/CAT-03): the 5-service zero-install bundled head -- github.notifications T1b seed + github.issues.* T1a (persisted-query /_graphql + from:'response' CSRF scrape) + slack.* T1a split-token (xoxc in the request BODY, xoxd HttpOnly cookie same-origin) + notion.* T1a /api/v3 token_v2 RPC + reddit.inbox T1b /message/unread.json. Every handler targets its web app's OWN first-party origin (github.com/app.slack.com/www.notion.so/www.reddit.com); the separate-origin public API (api.github.com/oauth.reddit.com/api.notion.com) is FORBIDDEN -- the session cookie does not cross to it (D-09, T-29-07). Each T1a handler builds bound spec(s) and calls ctx.executeBoundSpec only (never a browser scripting/tabs API) so the active-tab origin-pin holds on the head path (D-12); scraped tokens go ONLY into the bound spec, never a log line (T-29-08). The catalog declares the head EXPLICITLY (HEAD_HANDLER_MODULES manifest + seedHeadHandlers() reading each present handler global) and handlers self-register at load; reddit.inbox is a T1b REGISTRY entry. head-handlers 54/0, router 24/0, recipe-schema 43/0, recipe-path-guard PASS.
- [Phase 29]: Phase 29 Plan 03 Task 4 (live-capture checkpoint) resolved as deferred human_needed live-UAT (29-HUMAN-UAT.md, status human_needed), matching the Phase 27/28 posture -- NOT a fabricated live pass. The [ASSUMED] internal endpoint PATHS (RESEARCH A2/A3/A4) are the ONLY property not headlessly provable (capturing the real internal request needs real credentials, forbidden in CI per GOV-06); the origin-separation facts ARE web-search-verified and the DOM-fallback floor (Phase 32, T3) is the rot backstop. 10 [ASSUMED-ENDPOINT] markers across the handlers track the deferred capture; the headless CI gate does not depend on it.
- [Phase ?]: Phase 29 Plan 05 (CAT-04 / INV-02 / INV-04): autopilot front door 2 -- executeCapabilityToolForAutopilot is a pre-executeTool guard (CAPABILITY_TOOL_NAMES, ABOVE _te_getToolByName, the Pitfall-1 out-of-registry correction; NOT a switch case) calling the SAME globalThis.FsbCapabilityRouter.invoke the MCP dispatcher calls -- one engine, two front doors, no parallel autopilot stack. Reuses buildAutopilotTriggerParams + makeResult; search_capabilities -> FsbCapabilitySearch.search (never mutates), only invoke_capability sets hadEffect. Tools stay OUT of TOOL_REGISTRY; LLM reach is an additive buildSystemPrompt hint, never a tool schema (frozen INV-01 hash unmoved; getPublicTools omits them). The setTimeout iterator is byte-untouched (INV-04). Full npm test green; parity 10/0, iterator-guard 4/0, recipe-path-guard PASS.

### Top Risks (from research — bake into phase planning)

- **Recipe interpreter drifts into "code fetched as data" → Web Store ban (Wall 1, Phase 26):** freeze a closed opcode/enum vocabulary; CI guard fails on `eval`/`new Function`/`import(`; treat the hardest/most-popular services as bundled imperative handlers, never recipes.
- **Replay fetch from the wrong context (extension origin) → auth silently absent (Wall 2, Phase 27):** issue same-origin authenticated calls from the page MAIN world; a smoke test must assert the logged-in (not logged-out) data shape from a real HttpOnly site.
- **Credential-replay weapon / "safe brand" inversion (Phase 30):** default-OFF per origin; Off/Ask/Auto (Auto explicit per-origin, never global); origin-pinning in the interpreter; sign/verify server recipes; mutation gating; sensitive-origin friction.
- **Auth/recipe data routed off-device → exfiltration + Limited-Use violation (Phases 30/31):** auth strictly local; redact at capture time before persist/promote/egress; learned recipes store shape only; tested redactor asserts no auth substrings survive.
- **Recipe rot → confidently-wrong/empty results (Phase 32, the designed steady state):** stamp captured-at + schema hash; validate each response against an expected-shape assertion → typed `RECIPE_EXPIRED`; self-heal to DOM and re-learn; quarantine repeat failures.
- **Capability-search recall/precision failure (Phase 28):** index intent-phrased synonyms + service + action verb + side-effect class; disambiguate before any mutating invoke; eval harness (recall@k + wrong-invoke) gates the milestone.
- **MV3 SW eviction mid-API-call → lost in-flight request, ambiguous mutation (Phase 27):** reuse the `run_task` Phase 239 resume-sidecar + Lattice ResumePolicy; treat ambiguous mid-mutation as `RECOVERY_AMBIGUOUS` — never blind-retry.

### Research Flags (phases likely needing a `--research-phase` spike at plan time)

- **Phase 26 (recipe schema):** the highest-risk design artifact — the closed vocabulary must cover the realistic long tail yet be provably non-Turing-complete; needs a schema-design + RHC-line spike.
- **Phase 27 (fetch primitive):** spike capture/replay fidelity for CSRF/ephemeral tokens (per-session vs per-request nonce, Slack xoxc/xoxd split, persisted-query hash) and the `getResponseBody` > ~1 MB limit — these size the head/tail/DOM-fallback split.
- **Phase 31 (discovery):** spike CDP Network capture details (maxPostDataSize, extraInfo raw-header/cookie events, detach/restore so the existing Input emulation isn't disrupted) and the redactor's completeness test.
- **Phase 32 (self-heal):** spike the failure-detection taxonomy (which signals → DOM fallback without masking legitimate "no results") and the mutation-ambiguity recovery policy.

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items

Items acknowledged and carried forward from previous milestone closes (Chrome MV3/manual UAT evidence gaps, not fabricated passes; procedures archived under `.planning/milestones/*/`):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | Phase 01 / 01-HUMAN-UAT.md | partial; 1 pending scenario | v0.10.0 close |
| verification_gap | Phases 01-05, 08-12 / *-VERIFICATION.md | human_needed | v0.10.0 close |
| uat_gap | Phase 16 / 16-HUMAN-UAT.md | partial; 4 pending live-browser scenarios | v0.11.0 close |
| uat_gap | Phase 20 / 20-HUMAN-UAT.md | human_needed; 12 live-browser/composed trigger scenarios | v0.11.0 close |
| uat_gap | Phase 25 / 25-HUMAN-UAT.md | human_needed; 12 live Chrome-extension PhantomStream scenarios | v0.12.0 close |
| uat_gap | Phase 27 / 27-HUMAN-UAT.md | human_needed; live FETCH-05 logged-in-shape (UAT-27-01) + logged-out contrast + live origin-pin (3 scenarios); CI/automated half proven green in Plan 02 | v0.9.99 Phase 27 close |

Carry-forward publish/tag gates (pre-existing, user-gated): `npm publish fsb-mcp-server@0.9.0`; `npm publish fsb-mcp-server@0.10.0`; branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69 / v0.10.0 / v0.11.0 / v0.12.0; `clawhub publish "skills/FSB Skill"`; public package publication; 4 live-OpenClaw runtime UAT items; 12 Phase 20 live-browser/composed trigger UAT items; 12 Phase 25 live Chrome-extension PhantomStream UAT items.

## Lattice Integration State (carried, INV-06 from prior milestone)

Runtime is `@full-self-browsing/lattice@1.4.0` via the `lattice` alias; pin/guardrails remain `.planning/LATTICE-PIN.md`, `package-lock.json` integrity, and `tests/lattice-public-package.test.js`. v0.9.99 reuses Lattice Ed25519/JCS receipts for recipe signature verification (SIGN-01/02, Phase 30) and the `run_task`/Lattice ResumePolicy survival machinery for in-flight fetch resume (FETCH-04, Phase 27).

## Session Continuity

Last session: 2026-06-21T20:37:31.363Z
Stopped at: Completed 29-05-PLAN.md (autopilot parity front door; phase complete, ready for verification)
Resume file: None

## Next Actions

Phase 27 is execution-complete (all three plans done; FETCH-01..05 delivered): Plan 01 (interpreter query-fold + origin-pin `RECIPE_ORIGIN_MISMATCH`, `RECOVERY_AMBIGUOUS` errors.ts registration, capability-fetch.js allowlist entry; FETCH-03/04), Plan 02 (the `capability-fetch.js` MAIN-world credentialed-fetch spine + active-tab origin-pin + resume-sidecar + SW-side extract + `classifyOnWake`, the hardcoded github.com GET /notifications recipe, and the FETCH-01..05 CI mock suite `tests/capability-fetch.test.js`, 26 PASS), and Plan 03 (the live FETCH-05 logged-in-shape closeout: `27-HUMAN-UAT.md` status human_needed + a human-gated checkpoint accepted in auto-mode as recorded debt). FETCH-05's automated/CI half is green; the irreducibly-LIVE half (real GitHub HttpOnly cookies attach in the page MAIN world -> logged-in body shape) is recorded as human_needed UAT debt (UAT-27-01), NOT a fabricated pass, and joins the v0.10/v0.11/v0.12 live-browser UAT ledger. Next: run phase verification for Phase 27, then plan Phase 28 (Lean MCP Surface + Capability Search; SURF-01..06) which calls `executeBoundSpec` via `invoke_capability`. Existing live-browser UAT and release/publish actions remain carried-forward, user-gated debt.
