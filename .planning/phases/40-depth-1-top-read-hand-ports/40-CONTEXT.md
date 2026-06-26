# Phase 40: Depth 1 — Top READ Hand-Ports (DEPTH-01) — Context

**Gathered:** 2026-06-26
**Status:** Ready for planning
**Mode:** Orchestrator-gathered (the contract is fully specified by the shipped `github.js`/`slack.js`/`notion.js` heads + the v0.9.99 CAT/HEAL substrate; the conservative first-party-origin posture is locked by Wall 2 + DENY-04; app/op selection is Claude's discretion within the guidance below). No separate user discuss — decisions follow the established conservative posture + the autonomous "accept recommended" pattern.

<domain>
## Phase Boundary

Upgrade the HOT SUBSET already discoverable from the breadth corpus by hand-porting the
highest-value READ ops as first-class T1a handlers EXACTLY like the shipped `github.js` —
own first-party origin, `executeBoundSpec`-only, scraped tokens never logged — so the most-used
reads run on the API fast path (T1a) instead of DOM fallback (T3). This phase OWNS **DEPTH-01**
(the hand-port contract + the READ heads). Phase 41 owns the guarded-WRITE requirement AND the
per-app CORS verification for separate/unverified-origin (Pattern-D) ports.

**In scope:** ~8–12 highest-value **READ** heads across a small set of **verified-origin** apps;
each handler self-registers the EXACT existing `opentabs__<app>__<op>` descriptor slug so `resolve()`
upgrades it `dom`→`T1a` (no slug duplication); add each new module to `HEAD_HANDLER_MODULES` +
`background.js importScripts`; mirror the head-handler security tests (origin-separation,
no-token-logging, router-parity INV-02, head-cap ≤30).

**Out of scope:** WRITE hand-ports → Phase 41. Per-app CORS verification for separate-API-origin
or per-org-subdomain apps (datadog `*.datadoghq.com`, jira `*.atlassian.net`, supabase, mongodb-atlas,
circleci, cloud-console) → Phase 41 (it OWNS the CORS-gate dimension). Discovery seeding → 42.
The authoritative full-corpus scale/test gate → 43. NO change to the router tier-dispatch,
`executeBoundSpec` origin-pin, or HEAL classification (reuse the v0.9.99 substrate unchanged).
</domain>

<decisions>
## Implementation Decisions (locked by the shipped contract + the conservative posture)

### The hand-port contract (copy `github.js`/`notion.js`/`slack.js` verbatim in shape)
- IIFE module `catalog/handlers/<app>.js`; per-slug `{ tier:'T1a', origin, sideEffectClass:'read',
  params:<closed JSON Schema>, async handle(args, ctx) }`; self-register via
  `FsbCapabilityCatalog.registerHandler(slug, {...})`; export `global.FsbHandler<App>` + `module.exports`.
- `handle()` builds ONE bound spec and calls `ctx.executeBoundSpec(spec, ctx.tabId)` EXACTLY once.
  `spec.authStrategy:'same-origin-cookie'`, `spec.origin` = the app's FIRST-PARTY origin, `extract`
  = a JMESPath. NEVER call `chrome.scripting`/`chrome.tabs` (the origin-pin lives inside
  `executeBoundSpec`). Return the typed `{success,...}` / `{success:false,code,errorCode,error}` shape.
- GET reads model on `github.js`; JSON-body/GraphQL/RPC reads model on `notion.js`
  (`buildRpcSpec`) ; token-scrape reads model on `slack.js` (`callSlackMethod` xoxc probe — token
  ONLY in the bound spec body, never logged).

### Slug-EXACT-match for the upgrade (the correctness keystone)
- The opentabs breadth descriptor slug is DOT-form: `<app>.<op>` (e.g. `linear.search_issues`,
  `slack.list_channels`), service `<host>`, `backing:'dom'`, currently resolving `T3`. The handler
  MUST `registerHandler('<app>.<op>', …)` with the SAME slug → `resolve()` checks `REGISTRY` first
  (`capability-catalog.js:329`) and returns `T1a` with the descriptor attached. Wrong slug = a dead
  second entry, NOT an upgrade. Pick handler slugs by reading the actual `catalog/descriptors/
  opentabs__<app>__<op>.json` `slug` field — do NOT invent op names.

### First-party origin ONLY (Wall 2 — non-negotiable, security)
- The handler targets the app's OWN first-party origin (the origin the user's authenticated tab is
  on). A separate API host (api.<app>, oauth.<app>) is FORBIDDEN — the session cookie does not cross
  origins, and `executeBoundSpec` rejects any `spec.origin !== activeTabOrigin` with
  `RECIPE_ORIGIN_MISMATCH` BEFORE any executeScript (fail-closed, no side effect). A test asserts no
  `api.`-subdomain string and no `chrome.(scripting|tabs)` appears in each handler source.

### App/op selection — VERIFIED-ORIGIN, READ-only (Claude's discretion within this guidance)
- **PRIMARY (port now — high confidence, single/proven first-party origin):**
  - **linear** (`linear.app`, single origin; the roadmap's explicitly "documented-safe" flagship;
    GraphQL POST → model on `notion.js`): the top reads — `search_issues`, `list_issues`, `get_issue`,
    `list_teams`, `list_projects` (~5 heads). NEW module → `HEAD_HANDLER_MODULES` 3→4.
  - **slack** (EXTEND the existing `FsbHandlerSlack` head, proven `app.slack.com` + xoxc pattern):
    add the opentabs READ slugs `slack.list_channels`, `slack.list_members`, `slack.get_channel_info`
    (~2–3 heads, reuse `callSlackMethod`). No new module.
  - **notion** (EXTEND the existing `FsbHandlerNotion` head, proven `www.notion.so/api/v3` RPC):
    add the opentabs READ slugs `notion.search`, `notion.get_database`, `notion.query_database`
    (~2–3 heads, reuse `buildRpcSpec`). No new module.
  - This PRIMARY set = **~9–11 READ heads across 3 apps, ALL on verified/already-proven same-origin
    internal APIs** → hits SC1's 8–12 without any unverified origin.
- **SECONDARY (include ONLY if the planner/executor can justify a single first-party same-origin
  internal API from the vendored source + known web behavior; else defer to 41):** vercel
  (`vercel.com`), gitlab (`gitlab.com`), sentry (`sentry.io`), asana (`app.asana.com`) — single-origin
  SaaS likely serving same-origin internal reads. Each added module is a NEW `HEAD_HANDLER_MODULES`
  entry (stay ≤30).
- **DEFER to Phase 41 (needs the CORS verification / per-org-subdomain handling Phase 41 OWNS):**
  datadog (`*.datadoghq.com` per-org), jira (`*.atlassian.net` per-org), supabase, mongodb-atlas,
  circleci, any cloud-console. (The roadmap NAMES datadog/jira as examples, but their per-org
  subdomain breaks an exact origin-pin — correctly Phase-41 material.)

### Endpoint derivation + the live-UAT boundary (honest debt)
- Derive each read's path/shape from the **vendored real source** (`vendor/opentabs-snapshot/plugins/
  <app>/src/**`) RE-TARGETED to the first-party origin + same-origin-cookie (the opentabs plugin
  calls the public API with a bearer token; the hand-port calls the app's OWN-origin internal API
  with the session cookie). Where the first-party internal API path is documented/known, use it.
- **Live endpoint-correctness UAT (a real authenticated tab confirming the exact path returns the
  expected shape) is carried-forward, user-gated debt** — consistent with the prior phases' posture.
  The handlers ship **fail-closed**: a wrong origin → `RECIPE_ORIGIN_MISMATCH`; a wrong path / rot /
  logged-out 200 → HEAL classifies → `RECIPE_DOM_FALLBACK_PENDING` (the breadth DOM path still
  serves). The phase DELIVERABLE is the MECHANISM + the security properties (fully automatable +
  green), NOT live correctness. Add a per-handler `expectedShape`/extract so a logged-out body
  doesn't masquerade as success (the "200-with-logged-out-body" Top Risk).

### Invariants + cap
- **INV-02:** both front doors (MCP dispatcher + autopilot tool-executor) hit the SAME
  `FsbCapabilityRouter.invoke` → the registered T1a handlers; no autopilot-only path. **INV-01:** no
  new MCP tool; the frozen registry hash unmoved. **Head cap ≤30** on `HEAD_HANDLER_MODULES`
  (`head-handler-cap.test.js`) — update the expected-count + globals assertion as modules are added,
  keeping the cap. Wall 1 (closed-vocab data; no opentabs runtime). Wall 2 (origin-pin).

### Claude's Discretion
- The exact op selection within 8–12 (favor the highest-intent reads; read the descriptors).
- Whether to include any SECONDARY app (default: PRIMARY-only is sufficient; add a SECONDARY app
  only with a clear same-origin justification).
- Per-handler `extract` JMESPath + `expectedShape` guard shape.
- One module per app vs grouping (follow the existing one-file-per-app convention).
</decisions>

<code_context>
## Existing Code Insights (reuse the shipped contract + the v0.9.99 substrate unchanged)
- `catalog/handlers/github.js` (GET template), `catalog/handlers/notion.js` (`buildRpcSpec` JSON-body
  template), `catalog/handlers/slack.js` (`callSlackMethod` token-scrape template) — the 3 shapes.
- `extension/utils/capability-catalog.js`: `HEAD_HANDLER_MODULES` (:241-245, currently 3),
  `registerHandler` (:213-224), `seedHeadHandlers` (:258-279), `resolve()` REGISTRY-first upgrade
  (:329 + :347-355 dom→T3 + :396-403 T1a shape).
- `extension/utils/capability-router.js`: `invoke()` tier dispatch (:743-768), `_runHandlerTier`
  (:635-693) — builds `handlerCtx = {origin, tabId, executeBoundSpec, interpretRecipe}`, validates
  params, calls `handle()`, HEAL-classifies rot, stamps `tier:'T1a'`.
- `extension/utils/capability-fetch.js`: `executeBoundSpec` (:280-393) — the active-tab origin-pin
  (:284-306, `spec.origin !== tabOrigin` → `RECIPE_ORIGIN_MISMATCH` before executeScript) + MAIN-world
  inject + SW-side JMESPath extract.
- `extension/background.js`: `importScripts` chain (:179-180 catalog/router, :191-193 the 3 handlers —
  ADD each new handler after :193).
- `scripts/package-extension.mjs` (:91-115) copies `catalog/handlers/*` → `extension/catalog/handlers/`
  verbatim at build (no manual inline).
- Tests to mirror: `tests/capability-head-handlers.test.js` (per-handler tier/origin/no-api-subdomain/
  no-chrome-tabs/one-executeBoundSpec), `tests/capability-router.test.js` (tier dispatch + origin-pin
  + INV-02 parity), `tests/capability-fetch.test.js` (:208-220 origin-pin), `tests/head-handler-cap.test.js`
  (:34 CAP=30, :38 expected globals — UPDATE as modules are added).
- `vendor/opentabs-snapshot/plugins/<app>/src/**` — the real API shapes to re-target to first-party origin.
- `catalog/descriptors/opentabs__<app>__<op>.json` — the EXACT slugs to upgrade (read the `slug` field).

## Integration Points
- New handler module → self-registers the opentabs slug → `resolve()` upgrades dom→T1a → `invoke()`
  `_runHandlerTier` → `executeBoundSpec` (origin-pinned) → same-origin-cookie fetch in MAIN world.
- Both front doors → the SAME `FsbCapabilityRouter.invoke` (INV-02).
</code_context>

<specifics>
## Specific Ideas
- The phase PROVES the depth MECHANISM end-to-end: a NEW from-scratch module (linear) + slug-additions
  to EXISTING modules (slack/notion) both upgrade breadth descriptors dom→T1a, with the full security
  test battery green. That is the DEPTH-01 contract demonstrated across both the new-module and
  extend-module paths.
- THE security keystone: first-party origin ONLY (the origin-pin makes a separate-origin slip a
  fail-closed `RECIPE_ORIGIN_MISMATCH`, not a silent cross-origin leak) + no scraped token on a log line.
- THE correctness keystone: register the EXACT opentabs slug (read from the descriptor JSON) so the
  hand-port UPGRADES the breadth entry instead of minting a dead duplicate.
</specifics>

<deferred>
## Deferred Ideas
- WRITE hand-ports + the DENY-04 mutating re-enforcement + live-capture write UAT → Phase 41.
- Per-app CORS verification for separate-API-origin / per-org-subdomain ports (datadog, jira, supabase,
  mongodb-atlas, circleci, cloud-console) → Phase 41 (it OWNS the CORS-gate).
- Live endpoint-correctness UAT on authenticated tabs (all hand-ports) → carried-forward user-gated debt.
- Discovery seeding of the residual tail → Phase 42. Authoritative full-corpus scale/test gate → Phase 43.
</deferred>
