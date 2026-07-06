---
phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
plan: 03
subsystem: api
tags: [bundled-head, capability-handlers, t1a, t1b, origin-pin, split-token, persisted-query, rpc, recipe, mv3-service-worker, dual-export-iife, github, slack, notion, reddit]

# Dependency graph
requires:
  - phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
    provides: "Plan 02 FsbCapabilityCatalog.registerHandler(slug, entry) T1a seam + resolve()/biasByOwnedOrigin; FsbCapabilityRouter.invoke T1a handler-dispatch tier (handler.handle(args, ctx) with ctx.executeBoundSpec); Plan 01 RED tests/capability-router.test.js + the pre-armed package-extension.mjs handler-copy step"
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    provides: "FsbCapabilityFetch.executeBoundSpec (MAIN-world credentialed fetch + the active-tab origin-pin every handler call inherits; the from:'response' CSRF carrier, 27-D-06)"
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: "the closed recipe schema reddit-inbox.json validates against; the catalog/recipes + catalog/descriptors data shapes; the redactForLog no-token-logging discipline"
provides:
  - "catalog/handlers/github.js: github.issues.list (read GET) + github.issues.create (write POST /_graphql persisted-query + from:'response' CSRF scrape), T1a, pinned to github.com"
  - "catalog/handlers/slack.js: slack.conversations.list + slack.chat.postMessage, T1a split-token (xoxc scraped into the request BODY, xoxd HttpOnly cookie rides same-origin), pinned to app.slack.com"
  - "catalog/handlers/notion.js: notion.getSpaces + notion.loadPage, T1a /api/v3 POST RPC (token_v2 cookie), pinned to www.notion.so"
  - "catalog/recipes/reddit-inbox.json: reddit.inbox T1b same-origin GET /message/unread.json on www.reddit.com (schema-valid)"
  - "Four search descriptors (github-issues, slack-message, notion-spaces, reddit-inbox); the catalog HEAD_HANDLER_MODULES manifest + seedHeadHandlers() explicit head declaration; reddit.inbox T1b REGISTRY entry; background.js head-handler SW wiring"
  - "The 5-service zero-install bundled head exercising every mechanism class (single-GET recipe, persisted-query handler, split-token handler, RPC multi-call handler, second recipe), all reachable through the shared FsbCapabilityRouter"
affects: [phase-30-consent-mutation-gating-around-head-writes, phase-31-network-capture-discovery-of-new-recipes, phase-32-self-healing-DOM-fallback-floor-for-head-rot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Imperative T1a handler module (dual-export IIFE, slug-keyed {tier, origin, sideEffectClass, async handle(args, ctx)}) that builds bound spec(s) and calls ctx.executeBoundSpec ONLY -- never injects into a page -- so the origin-pin holds on the head path"
    - "from:'response' token sourcing: a prior read-only bound spec scrapes a CSRF/xoxc token, placed into the next spec (GitHub CSRF in a header; Slack xoxc in the BODY), never into a log line"
    - "Handler self-registration into FsbCapabilityCatalog via registerHandler at load + the catalog-side seedHeadHandlers() explicit manifest (defense-in-depth, the catalog still never imports a handler)"
    - "Forbidden-substring hygiene: separate-origin API hosts and browser scripting/tabs API names are kept out of handler SOURCE even in comments (the test scans source text, the recipe-path-guard precedent)"

key-files:
  created:
    - "catalog/handlers/github.js"
    - "catalog/handlers/slack.js"
    - "catalog/handlers/notion.js"
    - "catalog/recipes/reddit-inbox.json"
    - "catalog/descriptors/github-issues.json"
    - "catalog/descriptors/slack-message.json"
    - "catalog/descriptors/notion-spaces.json"
    - "catalog/descriptors/reddit-inbox.json"
    - "tests/capability-head-handlers.test.js"
    - ".planning/phases/29-catalog-tiered-router-bundled-head-declarative-tail-autopilo/29-HUMAN-UAT.md"
  modified:
    - "extension/utils/capability-catalog.js"
    - "extension/background.js"

key-decisions:
  - "github.notifications stays a T1b recipe (the proven single-GET seed); the github.issues.* slugs are the T1a head -- distinct slugs, a slug is EITHER T1a OR T1b, no runtime tie-break"
  - "Slack xoxc goes in the request BODY (form field), NEVER a header -- the load-bearing split-token detail; the xoxd HttpOnly cookie is left to the browser to attach same-origin"
  - "Each handler targets its web app's OWN first-party origin (github.com / app.slack.com / www.notion.so / www.reddit.com); the documented public API on a separate origin (api.github.com / oauth.reddit.com / api.notion.com) is FORBIDDEN -- the session cookie does not cross to it (D-09, Pitfall 3, T-29-07)"
  - "The catalog is the EXPLICIT head registry: a HEAD_HANDLER_MODULES manifest + seedHeadHandlers() reads each present handler global and registers its slugs as T1a; handlers also self-register at load (belt-and-suspenders) -- the catalog still never imports a handler"
  - "Task 4 (live-capture checkpoint) resolved as deferred human_needed live-UAT (29-HUMAN-UAT.md) per the autonomous-run posture -- NOT a fabricated pass; the [ASSUMED] internal endpoint PATHS are the only thing not headlessly provable"

patterns-established:
  - "Pattern 1: a T1a head handler is reviewed bundled CODE under catalog/handlers/*.js (NOT a recipe) that composes the multi-step / persisted-query / split-token logic the closed declarative schema cannot express, then delegates the actual credentialed request to ctx.executeBoundSpec so the pin is inherited"
  - "Pattern 2: scraped tokens flow ONLY into the bound spec (header or body), never a console/diagnostic line -- asserted by a source-level no-console-of-token-bearing-variable scan (T-29-08)"

requirements-completed: [CAT-02, CAT-03]

# Metrics
duration: 9min
completed: 2026-06-21
---

# Phase 29 Plan 03: Bundled Head (Zero-Install T1a Handlers + T1b Tail) Summary

**The 5-service zero-install bundled head -- GitHub-notifications (T1b seed) + GitHub-issues (T1a persisted-query /_graphql with from:'response' CSRF scrape) + Slack (T1a split-token, xoxc-in-body + xoxd-cookie) + Notion (T1a /api/v3 token_v2 RPC) + Reddit-inbox (T1b /message/unread.json) -- every handler first-party-origin-pinned through ctx.executeBoundSpec, exercising every mechanism class, with the [ASSUMED] internal endpoints recorded as deferred human_needed live-UAT.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-21T20:14:59Z
- **Completed:** 2026-06-21T20:23:15Z
- **Tasks:** 4 (3 implementation + 1 checkpoint resolved as deferred UAT)
- **Files modified:** 12 (10 created, 2 modified)

## Accomplishments

- Five high-value auth-bearing services are reachable as the zero-install head, within the 5-10 band, exercising every distinct mechanism class: single-GET recipe (github.notifications), persisted-query handler (github.issues.*), split-token handler (slack.*), RPC multi-call handler (notion.*), and a second same-origin recipe (reddit.inbox).
- Every T1a handler builds bound spec(s) and calls `ctx.executeBoundSpec` only -- it never references a browser scripting/tabs API -- so the active-tab origin-pin (inside executeBoundSpec) holds on the head path (D-12); proven by the router's real-pin test (a handler spec.origin != active-tab origin returns RECIPE_ORIGIN_MISMATCH with an empty executeScript recorder).
- Every handler/recipe targets its web app's OWN first-party origin; no separate-origin API host (api.github.com / oauth.reddit.com / api.notion.com) appears in any head file (source-scanned, T-29-07).
- The scraped tokens (GitHub CSRF, Slack xoxc/xoxd) flow only into the bound spec -- xoxc into the request BODY, CSRF into a header -- and never into a console/diagnostic line (T-29-08); the catalog declares each head slug's tier explicitly and descriptors exist so capability-search can find them.
- The live-capture half (the [ASSUMED] internal endpoint PATHS) is recorded as human_needed live-UAT in 29-HUMAN-UAT.md, not fabricated; the headless CI gate does not depend on it.

## Task Commits

Each task was committed atomically (Task 1-3 follow RED -> GREEN):

1. **TDD RED: head-handler suite** - `30d110e6` (test) -- clean RED 0/8 (all artifacts absent)
2. **Task 1: GitHub T1a head** - `4a9dccdb` (feat) -- github.js (issues persisted-query + CSRF scrape) + descriptor + catalog manifest/seed
3. **Task 2: Slack T1a split-token head** - `30aa38ad` (feat) -- slack.js (xoxc-in-body, xoxd-cookie) + descriptor + test stub refinement
4. **Task 3: Notion T1a /api/v3 + Reddit T1b + SW wiring** - `a5fb59bd` (feat) -- notion.js + reddit-inbox.json + 2 descriptors + reddit T1b REGISTRY entry + background.js head wiring
5. **Task 4: deferred live-capture UAT** - `b8502cf4` (docs) -- 29-HUMAN-UAT.md (status: human_needed)

**Plan metadata:** (the final docs commit captures SUMMARY + STATE + ROADMAP)

_Note: the three implementation tasks share one RED commit (the per-handler behavioral gate covers all three) -- TDD gate sequence test(RED) -> feat(GREEN) is satisfied._

## Files Created/Modified

- `catalog/handlers/github.js` - github.issues.list (read GET /issues) + github.issues.create (write POST /_graphql persisted-query); a from:'response' CSRF probe scrapes the token into the POST header; pinned to github.com; [ASSUMED-ENDPOINT] flags throughout.
- `catalog/handlers/slack.js` - slack.conversations.list + slack.chat.postMessage; a from:'response' probe scrapes xoxc into the request BODY (form field); xoxd HttpOnly cookie rides same-origin; pinned to app.slack.com.
- `catalog/handlers/notion.js` - notion.getSpaces + notion.loadPage; same-origin POST /api/v3/<op> RPC; token_v2 cookie rides same-origin; pinned to www.notion.so.
- `catalog/recipes/reddit-inbox.json` - reddit.inbox T1b recipe: GET /message/unread.json on www.reddit.com, same-origin-cookie, schema-valid.
- `catalog/descriptors/{github-issues,slack-message,notion-spaces,reddit-inbox}.json` - search descriptors (slug/service/intentSynonyms/description/actionVerb/sideEffectClass).
- `extension/utils/capability-catalog.js` - HEAD_HANDLER_MODULES manifest + seedHeadHandlers() (explicit head declaration reading each present handler global); reddit.inbox T1b REGISTRY entry + its inline recipe.
- `extension/background.js` - load the 3 head handler modules after capability-catalog.js (each self-registers; seedHeadHandlers() re-asserts), each importScripts independently try/catch'd, additive only.
- `tests/capability-head-handlers.test.js` - the per-handler behavioral gate (54/0): tier/origin/handle shape, single-call executeBoundSpec dispatch, no chrome.*, no separate-origin host, xoxc-in-body, no token logging, reddit recipe schema-valid, descriptors valid.
- `.planning/.../29-HUMAN-UAT.md` - the deferred live-capture UAT (5 scenarios, status: human_needed).

## Decisions Made

See key-decisions frontmatter. The load-bearing ones: (1) the head targets each web app's OWN first-party origin (never a separate API origin) because executeBoundSpec re-pins the active tab and the session cookie is origin-scoped; (2) Slack xoxc goes in the BODY not a header; (3) github.notifications stays T1b while github.issues.* is T1a (a slug is EITHER T1a OR T1b); (4) Task 4 is deferred human_needed UAT, not a fabricated live pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Forbidden API-origin / browser-API substrings appeared in handler COMMENTS**
- **Found during:** Task 1 (GitHub handler)
- **Issue:** The handler's explanatory comments contained the literal strings `api.github.com` (e.g. "NOT api.github.com/graphql") and `chrome.scripting`. The acceptance-criterion source scan and the T-29-07/T-29-08 security assertions scan SOURCE TEXT (the recipe-path-guard precedent of scanning even comments), so the forbidden substrings tripped the no-separate-origin-host / no-browser-scripting-API checks even though the executable code was correct.
- **Fix:** Reworded the comments to describe the constraint without naming the forbidden host/API literally ("the public api subdomain is a separate origin"; "no browser-extension scripting/tabs APIs are referenced"). The executable specs were already correct (pinned to github.com, no chrome.* calls).
- **Files modified:** catalog/handlers/github.js
- **Verification:** node tests/capability-head-handlers.test.js github section 16/0; the plan's Task 1 automated verify (`s.indexOf('api.github.com')===-1` and `!/chrome\.(scripting|tabs)/.test(s)`) passes.
- **Committed in:** 4a9dccdb (Task 1 commit)

**2. [Rule 1 - Bug] The RED-test GET-probe stub did not exercise the token body-placement path**
- **Found during:** Task 2 (Slack handler)
- **Issue:** The original head-handler test stub answered every executeBoundSpec call with `data:{ok:true}`. Because each handler's from:'response' token scrape reads the token out of the probe RESULT, a probe that carries no token means the handler (correctly) embeds no token, so the "xoxc in the BODY" assertion could not pass -- the stub was under-specified, not the handler.
- **Fix:** The stub now answers a read-only GET probe with a canned synthetic token payload (`xoxc`/`csrf_token`/`authenticity_token`), so the SUBSEQUENT POST spec carries the token the handler scraped -- exercising the real body-placement path. Synthetic fixtures only, never real credentials. The assertion (token in body, NOT in a header) was not weakened.
- **Files modified:** tests/capability-head-handlers.test.js
- **Verification:** node tests/capability-head-handlers.test.js Slack body-placement + no-header assertions GREEN; full suite 54/0.
- **Committed in:** 30aa38ad (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs). Both were source-hygiene / test-fidelity fixes; the executable handler behavior matched the plan as written. No scope creep.

## Issues Encountered

None beyond the two auto-fixed deviations above. All four CI gates stayed/became GREEN: capability-router.test.js 24/0 (unchanged from baseline), capability-head-handlers.test.js 54/0 (new), capability-recipe-schema.test.js 43/0 (reddit recipe schema-valid), verify-recipe-path-guard PASS.

## Known Stubs

These are intentional, tracked, and resolved by the deferred live-UAT -- they do NOT block the plan's goal (the architecture is fully exercised headlessly; only the real endpoint PATHS are deferred):

| Stub | Files | Line marker | Reason / resolution |
|------|-------|-------------|---------------------|
| `[ASSUMED-ENDPOINT]` internal endpoint PATHS, CSRF/token carriers, and request body shapes | catalog/handlers/github.js, slack.js, notion.js (10 markers) | `// [ASSUMED-ENDPOINT: capture live in 29-03 Task 4]` | The internal endpoint PATHS are training/inference-derived (RESEARCH A2/A3/A4) and cannot be confirmed without a real authenticated tab (forbidden in CI, GOV-06). Resolved by the deferred human_needed live-UAT in 29-HUMAN-UAT.md (UAT-29-01..05). The origin-SEPARATION facts (which APIs live on a separate origin) ARE web-search-verified; the DOM-fallback floor (Phase 32, T3) is the rot backstop. |

## User Setup Required

None - no external service configuration required for the codeable work. The live-capture UAT (29-HUMAN-UAT.md) requires a human with real authenticated sessions to github.com / app.slack.com / www.notion.so / www.reddit.com to confirm/correct the [ASSUMED] endpoints; this is deferred live-browser UAT debt, joining the Phase 27 ledger.

## Next Phase Readiness

- The 5-service head is wired and routes through the shared FsbCapabilityRouter (the engine the Plan 04 dispatcher reroute + autopilot branch hit -- INV-02). Plan 04 (the internal-only invoke reroute) is already complete, so the head is reachable via the MCP invoke_capability front door now.
- Phase 30 (consent / mutation gating / signature verification / audit) is the next governance layer around the head's WRITE slugs (github.issues.create, slack.chat.postMessage) -- they run UNGATED this phase (the origin-pin still holds), exactly as Phase 27/28 invoke does.
- Deferred: the [ASSUMED] internal endpoint live capture (29-HUMAN-UAT.md, human_needed) -- the only non-headless-provable property; the DOM-fallback floor (Phase 32) is the rot backstop if a captured endpoint later breaks.

## Self-Check: PASSED

All 11 created files exist on disk (3 handlers, 1 recipe, 4 descriptors, 1 test, the UAT doc, this SUMMARY). All 5 task commits exist in git (30d110e6 RED, 4a9dccdb GitHub, 30aa38ad Slack, a5fb59bd Notion+Reddit+wiring, b8502cf4 UAT). All four CI gates GREEN: capability-router 24/0, capability-head-handlers 54/0, capability-recipe-schema 43/0, verify-recipe-path-guard PASS.

---
*Phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo*
*Completed: 2026-06-21*
