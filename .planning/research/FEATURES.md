# Feature Research

**Domain:** Authenticated-API capability catalog (FSB v1.0.0 "Full App Catalog / OpenTabs Parity") — porting OpenTabs' 119-app / 2,523-op surface onto FSB's fixed closed-vocabulary recipe interpreter + bundled-head architecture.
**Researched:** 2026-06-23
**Confidence:** HIGH for the auth taxonomy and tier mapping (grounded in 20 OpenTabs `*-api.ts` files read directly from `github.com/opentabs-dev/opentabs@main`, plus the FSB slack handler + recipe-index as the FSB-side anchor). MEDIUM for the per-app value ranking (op-count is verified; "where FSB users live" is a product judgement). HIGH for the anti-feature/denylist (ToS + sensitivity are categorical, not speculative).

> Supersedes the prior v0.9.99 FEATURES.md (archived milestone). This file is the active v1.0.0 catalog research.

---

## TL;DR for the roadmapper

1. **The whole catalog (119 apps) is "table stakes" only as DESCRIPTORS.** Breadth = codegen descriptors so every app returns from `search_capabilities`. That is cheap and uniform. It does NOT mean every app is invocable on day one.
2. **Invocability splits by AUTH STRATEGY, and the discriminator is brutally simple for FSB:** *does the app call its OWN first-party origin, or a SEPARATE API origin?* FSB's Wall 2 is a MAIN-world `fetch()` with `credentials:'include'` — **identical** to OpenTabs' `fetchFromPage` (verified: `platform/plugin-sdk/src/fetch.ts` is a plain page-context fetch, NO background proxy). So FSB inherits OpenTabs' CORS reality exactly. Apps that hit a separate API origin only work if that origin returns permissive `access-control-allow-credentials: true` + a matching `allow-origin` — most do NOT.
3. **Recommended depth shortlist = 22 apps** (detailed below), biased to dev/PM/cloud/observability, ranked by value × feasibility. The cheapest wins are same-origin-cookie apps with a CSRF/preloaded-token read from a meta tag or `window` global.
4. **Denylist must land FIRST** (it already does in the milestone plan). ~18 apps are ToS-hostile or sensitivity-critical (banking, brokerage, health-adjacent, dating, DRM-streaming, anti-automation social). These get `deniedOrigins`; a wider sensitive set gets `sensitiveOrigins` (Ask-gated, never Auto).

---

## Grounding: the 5 real auth patterns observed in OpenTabs source

Every app I inspected collapses into one of these. The FSB tier follows mechanically from which one it is. Citations are the app's `src/<app>-api.ts` at `opentabs-dev/opentabs@main`.

### Pattern A — Same-origin cookie, GET, no token (pure T1b recipe)
The web app calls its OWN origin; HttpOnly session cookie rides automatically; reads need no CSRF. This is the *only* pattern expressible as a closed-vocabulary FSB **recipe** (data, no code).

- **netlify** (`netlify-api.ts`): `API_BASE = '/access-control/bb-api/api/v1'` (same-origin), auth detected via non-HttpOnly `_nf-auth-hint` cookie; `fetchJSON` default `credentials:'include'`. *"no explicit token needed."*
- **reddit** (already FSB T1b): `/message/unread.json` same-origin.
- **github notifications** (already FSB recipe): `/notifications` with `Accept: application/json`.
- **shortcut** (`shortcut-api.ts`): `/backend/api/v3${endpoint}` same-origin, *"documented public API, same-origin with session cookies."*

> FSB mapping: **T1b same-origin-cookie recipe.** GET-only ops. Zero hand-code. These are the long-tail freebies — but note the *write* side of even these apps usually needs a CSRF token (Pattern B), so a given app is often "T1b for reads, T1a for writes."

### Pattern B — Same-origin cookie + scraped CSRF/anti-forgery token (T1a handler)
Reads ride the cookie; writes need a token the closed recipe schema can't express (it must be SCRAPED live from a meta tag, `window` global, or localStorage, then placed in a header or body). This is the github/notion precedent and the bulk of the high-value head.

- **github** (`github-api.ts`): auth via `<meta name="user-login">`; CSRF from `input[name="authenticity_token"]`; `/_graphql` persisted queries + `{meta,payload}` page-JSON + Turbo-Frame Relay extraction. (This is exactly FSB's existing github head.)
- **gitlab** (`gitlab-api.ts`): auth via `window.gon.current_username`; CSRF from `<meta name="csrf-token">`; same-origin `/api/v4`.
- **jira** (`jira-api.ts`): auth via `<meta name="ajs-atlassian-account-id">` + `ajs-cloud-id`; same-origin `/rest/api/3`.
- **confluence** (`confluence-api.ts`): same Atlassian meta-tag pattern (`ajs-*`), `credentials:'include'`.
- **datadog** (`datadog-api.ts`): CSRF in **localStorage** `dd-csrf-token` (JSON `{token,timestamp}`), *rotates* — read fresh every call; sent as `x-csrf-token`/`x-dd-csrf-token` header AND `_authentication_token` body field. Same-origin.
- **sentry** (`sentry-api.ts`): org slug from subdomain/path; `sentry-sc` non-HttpOnly CSRF cookie → `X-CSRFToken` header for writes; same-origin.
- **cloudflare** (`cloudflare-api.ts`): same-origin `/api/v4`; `x-atok` header from `window.bootstrap.atok` (timestamp-prefixed, refreshes per page load — read live); *"Cross-origin requests to api.cloudflare.com are blocked by CORS."* (explicit confirmation of the FSB-forbidden pattern).
- **airtable** (`airtable-api.ts`): `window.initData.csrfToken` + `sessionUserId`; same-origin `/v0.3/`; `_csrf` body field.
- **linkedin** (`linkedin-api.ts`): CSRF = the `JSESSIONID` cookie value itself, sent as `csrf-token` header; same-origin voyager/graphql.
- **x / twitter** (`x-api.ts`): `ct0` cookie → `x-csrf-token`; **static public bearer** embedded in the JS bundle (same for all users) → `authorization` header; same-origin `x.com/i/api/graphql`. (Mechanically portable, but see anti-features — ToS-hostile.)

> FSB mapping: **T1a bundled handler** (the slack.js shape). The handler does a `from:'response'` scrape to get the token, then `executeBoundSpec` against the first-party origin. This is the proven github/notion/slack pattern.

### Pattern C — Split-token / webpack-extracted / WebSocket-captured token (T1a handler, hard)
The token is not in a cookie or a tidy global — it's split across cookie+body, or buried in the SPA's internal module registry, or only emitted on a WebSocket auth frame. Still same-origin for transport, but extraction is bespoke and brittle.

- **slack** (FSB's existing head): `xoxc` token scraped from page state → request **body** (not header); `xoxd` HttpOnly cookie rides automatically. *Body placement is load-bearing.*
- **discord** (`discord-api.ts`): token extracted from **Discord's webpack module registry** via a `getToken()` probe across the module cache. Extremely brittle (breaks on every bundler reshuffle).
- **clickup** (`clickup-api.ts`): JWT captured from the **WebSocket auth frame** (`{method:'auth', token}`), stashed on `globalThis.__cu_captured_jwt`; `apiUrlBase` from `cuHandshake` localStorage. Requires observing a live WS — not a simple fetch.
- **stripe** (`stripe-api.ts`): `window.PRELOADED.session_api_key` (Bearer) + `PRELOADED.csrf_token` + merchant id; same-origin `/v1` proxy; *"dashboard's Service Worker normally injects this token, but adapter code must add it explicitly."* Portable but multi-field.
- **chatgpt** (`chatgpt-api.ts`): access token requires an **async fetch** to `/api/auth/session` first, then Bearer to `/backend-api`. Two-step, same-origin.

> FSB mapping: **T1a handler if same-origin and the extraction is a stable scrape** (slack, stripe, chatgpt). **T2/T3-only if extraction needs webpack-internals or a live WebSocket** (discord, clickup) — those are too fragile to hand-port and should be left to learned discovery / DOM fallback.

### Pattern D — SEPARATE API origin + bearer from localStorage (T1a *only if* CORS permits; else FSB-FORBIDDEN → T2/T3)
The app reads a bearer/access token from localStorage and posts it to a DIFFERENT origin than the page. **This is the critical FSB feasibility cliff.** OpenTabs' `fetchFromPage` is a page-context fetch, so this only works when the API origin sends `access-control-allow-credentials: true` + a matching `allow-origin`. FSB inherits the same constraint — there is NO background-proxy escape hatch (the milestone context's "separate-origin public API is FORBIDDEN" rule = this CORS reality).

- **linear** (`linear-api.ts`): GraphQL at `https://client-api.linear.app/graphql` (separate subdomain from `linear.app`). **OpenTabs documents the CORS allowance explicitly**: *"access-control-allow-origin: https://linear.app; access-control-allow-credentials: true … in-page fetch() with credentials:'include' sends the HttpOnly cookies automatically. No fetchViaBackground needed."* Bearer-less; needs `useraccount`/`user`/`organization` headers read from `localStorage.ApplicationStore`. **→ FEASIBLE for FSB** because the cross-origin CORS is permissive *and* FSB pins the page origin to `linear.app`.
- **supabase** (`supabase-api.ts`): `https://api.supabase.com/v1`; Bearer from `localStorage['supabase.dashboard.auth.token']`. Separate origin. Works in OpenTabs only if api.supabase.com allows the dashboard origin with credentials. **→ VERIFY CORS before porting**; treat as conditional.
- **robinhood** (`robinhood-api.ts`): FOUR separate origins (`api.`/`bonfire.`/`nummus.`/`dora.robinhood.com`); Bearer from `localStorage['web:auth_state']`. **→ DENYLIST anyway (brokerage), moot.**
- **asana** (`asana-api.ts`): `https://app.asana.com/api/1.0` — same registrable origin as the app (app.asana.com), cookie-based, `credentials:'include'`. **→ effectively Pattern B, FEASIBLE.**
- **figma** (`figma-api.ts`): `https://www.figma.com/api` — same-origin as the app; cookie-based (`__Host-figma.authn-state`). **→ Pattern B, FEASIBLE.**

> FSB mapping: **Per-app CORS check is mandatory.** Same-registrable-origin (asana, figma, x) → T1a. Separate origin WITH documented permissive CORS (linear) → T1a. Separate origin without it (most "public API" subdomains) → **FSB-FORBIDDEN, demote to T2-learned/T3-DOM.** The roadmap MUST NOT assume an app is portable just because OpenTabs ships it — OpenTabs' own success depends on the same CORS gate. Linear is the proof that "separate origin" ≠ "impossible," but it's the exception that documents its own CORS, not the rule.

### Pattern E — Host-SDK trampoline (`gapi.client.request`) (T1a handler, Google-specific)
Google properties don't expose a clean REST surface to scrape; instead the page loads `gapi` and you call through `window.gapi.client.request`. Same-origin-ish but you're invoking the page's own SDK function, not issuing your own fetch.

- **google-calendar / google-docs / google-drive** (`*-api.ts`): all gate on `window.gapi.client.request`; `API_BASE` like `/calendar/v3`, `/drive/v3`; auth presence via `SAPISID` cookie + gapi-ready. Calling requires invoking the page global, not a bare fetch.

> FSB mapping: **T1a handler that bridges to the page's `gapi.client.request` via the MAIN-world.** FSB already runs MAIN-world JS (it has `execute_js` + `<all_urls>`), so this is feasible but is a distinct handler shape from the fetch-based ones — budget extra design. Google apps are high value (calendar/docs/drive) and worth the special case.

---

## Auth-strategy → FSB-tier taxonomy (the deliverable)

| Auth pattern (observed) | Transport origin | Token source | FSB tier | Codegen-able as DATA recipe? | Example apps |
|---|---|---|---|---|---|
| **A. Cookie-only GET** | first-party (same-origin) | none (cookie) | **T1b recipe** | **YES** (closed-vocab) | netlify (reads), reddit, github-notifications, shortcut (reads) |
| **B. Cookie + scraped CSRF** | first-party (same-origin) | meta tag / `window` global / localStorage / cookie-as-CSRF | **T1a handler** | No (scrape = code) | github, gitlab, jira, confluence, datadog, sentry, cloudflare, airtable, linkedin, asana, figma |
| **C. Split / webpack / WS token** | first-party (same-origin) | request-body split, webpack registry, WS frame | **T1a (if stable scrape) / T2-T3 (if webpack/WS)** | No | slack, stripe, chatgpt *(T1a)*; discord, clickup *(T2/T3)* |
| **D. Separate API origin + bearer** | **cross-origin** | localStorage bearer | **T1a ONLY if CORS permits + origin-pinned; else FSB-FORBIDDEN → T2/T3** | No | linear *(feasible, documented CORS)*; supabase *(verify)*; robinhood *(denylist)* |
| **E. Host-SDK trampoline** | first-party via `gapi` | page SDK | **T1a (gapi-bridge handler)** | No | google-calendar, google-docs, google-drive |

**Rule of thumb for the generator:** default every imported descriptor to **T2/T3-discoverable** (learned/DOM). PROMOTE to T1b recipe only if the op is a same-origin GET with no token. PROMOTE to T1a only for the hand-ported shortlist below. This keeps Wall 1 intact (recipes stay pure data; anything needing a scrape is compiled code in the head, never shipped as recipe data).

---

## Feature Landscape

### Table Stakes (Users Expect These)

For a "full app catalog" milestone, the table stakes are about *coverage + discoverability + safety*, not about every app being deeply wired.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All 119 apps return from `search_capabilities` (descriptor import) | "OpenTabs parity" means the app is *findable*; a missing app reads as "FSB can't do X" | MEDIUM | Codegen descriptors (slug, service, intent synonyms, action verb, side-effect class, params JSON-Schema) from OpenTabs manifests. Scale `recipe-index.generated.js` from ~10 to ~2,523 descriptors with a stable `catalogVersion`. Search index (minisearch) must stay performant at thousands of docs (SURF-04 precedent). |
| Per-op `sideEffectClass` (read/write) on every descriptor | The consent gate + Auto/Ask/Off policy keys off side-effect class; a write mislabeled as read is a safety hole | MEDIUM | Derive from OpenTabs tool metadata (each `src/tools/<op>.ts` declares its mutation intent). Cross-check descriptor side-effect vs recipe at scale ("descriptor-vs-recipe side-effect cross-check"). |
| Denylist covering ToS-hostile + sensitive apps, landing BEFORE any sensitive app is reachable under Auto | Shipping a finance/health/dating app reachable under the opt-out Auto default is a legal + trust failure | LOW (data) / HIGH (judgement) | Grow `extension/config/service-denylist.json` `deniedOrigins` + `sensitiveOrigins`. Sequenced first in the milestone. See anti-features. |
| First-party origin-pin on every invocation | The whole security model (Pitfall-3 credential replay) depends on specs targeting the app's OWN origin so the right cookie attaches and no token leaks cross-origin | LOW | Already enforced by `executeBoundSpec` re-pin; descriptors must carry the correct `service`/origin. |
| Scraped tokens never logged | github/slack/datadog all scrape secrets; one `console.log` of a token is a credential leak | LOW | `redactForLog` discipline already in slack.js; enforce in every new handler + the Node CI path-guard. |
| MIT attribution / provenance per imported descriptor | OpenTabs is MIT; derived descriptors need attribution | LOW | Already in README Acknowledgements; add per-app provenance field. |
| Seeded discovery for the non-ported tail (119 origins + endpoint hints) | Apps not in the depth head must still be *reachable* via the network-capture learner, consent-gated | MEDIUM | Seed origins + known endpoint hints so the learner reliably promotes T2 recipes. |

### Differentiators (Competitive Advantage)

These are where FSB does something OpenTabs structurally *cannot*, and they should be foregrounded.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Zero-install catalog** | OpenTabs is npm-per-plugin (119 installs). FSB ships the whole descriptor surface in one extension; depth head is bundled; tail is learned. No `npm i @opentabs-dev/plugin-*` ever. | (already the architecture) | This is the headline. The milestone's "port + learn, do NOT clone the npm-per-plugin model" IS the differentiator. |
| **Self-healing DOM fallback (T3) on every app** | When a recipe/handler breaks (token moved, endpoint changed — and they DO: datadog rotates CSRF, cloudflare atok refreshes, discord webpack reshuffles), FSB drops to its DOM engine and still completes the task. OpenTabs just fails. | (existing) | Turns the brittle Pattern-C/D apps from "broken" into "slower but works." Huge reliability edge. |
| **Learned discovery auto-grows the catalog (T2)** | The tail FSB doesn't hand-port gets learned from observed network traffic, consent-gated, and promoted to procedural memory. Catalog grows without code releases. | (existing discovery path) | Lets FSB credibly claim "all apps usable" without 2,523 hand-written handlers. |
| **MV3-survivable closed-vocabulary recipes** | Recipes are DATA bound by a fixed interpreter — no remotely-hosted code, survives MV3 Wall 1. OpenTabs ships actual TS code per plugin (impossible to stream into an MV3 extension). | (existing CAP-01..05) | The reason FSB can have a streaming long tail at all. |
| **Unified consent governance across the whole catalog** | One Off/Ask/Auto policy + audit log spanning all 119 apps, defaulting safe. OpenTabs has no equivalent cross-app supervision layer. | (existing v0.9.99 Phase 30) | Lets the denylist + sensitive-origin tiers be enforced uniformly. |

### Anti-Features (Commonly Requested, Often Problematic)

These are the apps/behaviors that "complete the catalog" superficially but must be DENYLISTED or skipped. Grouped by reason. (Apps named below are confirmed present in the 119-plugin list.)

| App / behavior | Why requested | Why problematic | FSB action |
|---|---|---|---|
| **netflix, spotify (playback), youtube-music, twitch, steam** | "automate my media" | DRM / ToS forbid automation; near-zero agentic value; playback isn't an API task | **deniedOrigins** (skip; descriptors may exist but never invocable). netflix already a known denylist target. |
| **tinder** | "auto-swipe" | Dating ToS explicitly ban automation; reputational + harassment risk | **deniedOrigins.** |
| **onlyfans** | catalog completeness | Adult/payment/ToS; sensitivity + reputational | **deniedOrigins.** |
| **instagram, facebook, tiktok, pinterest, bluesky, tumblr, x** | "auto-post / scrape my feed" | Aggressive anti-automation; bot bans; x uses a static bundle bearer that's a ToS tripwire; engagement automation is abuse-adjacent | **deniedOrigins for write/engagement ops**; read-only `sensitiveOrigins` at most. x is mechanically portable (Pattern B) but **should be denied** to avoid account bans. |
| **whatsapp, telegram, discord (DMs)** | "send messages for me" | Spam/abuse vector; webpack/WS token extraction (discord) is brittle; mass-DM is the #1 abuse pattern | **sensitiveOrigins** (Ask-only, never Auto) at minimum; deny write ops for messaging if abuse risk too high. |
| **robinhood, fidelity, coinbase, carta, ynab** | "check my portfolio / trade" | Brokerage/financial trades = catastrophic on a misfire; multi-origin bearer auth (robinhood) compounds risk | **deniedOrigins** for any trade/transfer (write); reads at most **sensitiveOrigins** (Ask). Milestone already sequences finance behind denylist. |
| **stripe (write), twilio (send)** | "issue a refund / send an SMS" | Money movement + outbound comms = real-world side effects with cost; stripe writes touch live charges | **sensitiveOrigins** (Ask-only); never Auto. Reads (list charges) can be T1a; writes gated hard. |
| **Banking generally (not in the 119 but category)** | — | Regulatory + catastrophic | Pre-emptive **deniedOrigins** category in the denylist schema. |
| **"Hand-port all 2,523 ops as code handlers"** | "real parity" | Violates the milestone strategy; unmaintainable; most ops low-value; brittle Pattern-C/D apps break constantly | **Descriptor import + tiered backing.** Depth = curated ~22-app head only. |
| **"Use the public REST API (api.github.com, api.cloudflare.com)"** | "cleaner than scraping" | Session cookie does NOT cross to the separate API origin; CORS blocks it (cloudflare source says so explicitly) | **FORBIDDEN.** Always target the app's first-party origin. |
| **e2e-test, prescript-test** | — | Test fixtures, not real apps | **Skip** (exclude from descriptor import). |

---

## Recommended DEPTH-TIER shortlist (~22 apps to hand-port as T1a/T1b head)

Ranked by **value × feasibility**, biased to dev / PM / cloud / observability where FSB's users live. Value = audience fit + op count + agentic usefulness. Feasibility = which auth pattern (A/B easy, C-stable medium, C-webpack/WS or D-no-CORS hard). All must use `executeBoundSpec`-only, first-party origin-pin, no token logging — the slack.js contract. Op counts verified via `gh api .../src/tools --jq length`.

| # | App | Category | Ops | Auth pattern | Feasibility | Value rationale |
|---|---|---|---|---|---|---|
| 1 | **linear** | PM/dev | 60 | D (separate origin, **documented permissive CORS**) + localStorage headers | MEDIUM | Highest-value PM tool for FSB's dev audience; huge op surface; CORS is documented-safe + origin-pinnable. The flagship depth port. |
| 2 | **jira** | PM | 21 | B (Atlassian meta tags, same-origin `/rest/api/3`) | EASY | Enterprise PM ubiquity; clean documented REST; trivial auth scrape. |
| 3 | **github** | dev | 36 | B (persisted-query + CSRF) | DONE (exists) | Already FSB head; extend ops. Anchor of the dev audience. |
| 4 | **gitlab** | dev | 23 | B (`gon` global + meta CSRF, `/api/v4`) | EASY | Mirrors github; same-origin; large self-host base. |
| 5 | **datadog** | observability | 72 | B (rotating localStorage CSRF, same-origin) | MEDIUM | Biggest observability op surface; core to FSB's ops/dev users. Caveat: CSRF rotates — read live every call (source warns). |
| 6 | **sentry** | observability | 22 | B (`sentry-sc` CSRF cookie, same-origin) | EASY | Error triage is a top agent task; clean same-origin CSRF. |
| 7 | **vercel** | cloud/deploy | 9 | B-ish (HttpOnly `authorization` cookie, same-origin `/api`) | EASY | Deploy/inspect is high-frequency for dev users; smallest-effort win (cookie does the work, team slug from URL). |
| 8 | **netlify** | cloud/deploy | 41 | A/B (cookie-only reads, same-origin `/access-control/bb-api`) | EASY | Reads are pure T1b recipes (no token); large op count; deploy audience. |
| 9 | **cloudflare** | cloud/infra | 31 | B (`x-atok` from `window.bootstrap`, same-origin `/api/v4`) | MEDIUM | Infra-critical; same-origin proven; atok refreshes (read live). Source explicitly confirms cross-origin is CORS-blocked → first-party pin mandatory. |
| 10 | **confluence** | docs/PM | 22 | B (Atlassian `ajs-*` meta, same-origin) | EASY | Pairs with jira; same auth scrape; docs/knowledge tasks. |
| 11 | **notion** | docs | 19 | B (`token_v2` cookie + `/api/v3` RPC) | DONE (exists) | Already FSB head; extend. Top docs/PM surface. |
| 12 | **slack** | comms | 23 | C (split-token, same-origin) | DONE (exists) | Already FSB head. Comms backbone for teams. |
| 13 | **figma** | design/docs | 15 | B/D (same-origin `www.figma.com/api`, cookie) | EASY | Design handoff is a real agent task; same-origin cookie. |
| 14 | **asana** | PM | 25 | D-as-B (`app.asana.com/api/1.0`, same registrable origin, cookie) | EASY | Major PM tool; cookie-only; effectively same-origin. |
| 15 | **todoist** | PM/personal | 34 | B (localStorage `User.token` Bearer, same-origin `/api/v1`) | EASY | High op count; same-origin; popular task surface. |
| 16 | **supabase** | db/backend | 27 | D (separate `api.supabase.com`, localStorage Bearer) | MEDIUM (**verify CORS**) | Core dev/db tool; HIGH value IF api.supabase.com permits the dashboard origin with credentials. Port only after CORS check. |
| 17 | **shortcut** | PM/dev | 28 | A (documented public API, same-origin `/backend/api/v3`) | EASY | Clean documented API, same-origin cookie; good op count; dev-PM fit. |
| 18 | **stripe** | finance/dev | 31 | C (`PRELOADED` bearer+csrf, same-origin `/v1`) | MEDIUM | High dev value for READS (list charges/customers); **writes → sensitiveOrigins Ask-only.** Port reads first. |
| 19 | **mongodb-atlas** | db | 21 | (verify; expect B/D) | MEDIUM | Core db tool for dev audience; confirm auth pattern + CORS before committing. |
| 20 | **circleci** | dev/CI | 34 | (verify; expect B same-origin) | MEDIUM | CI status/retrigger is a frequent agent task; large op count; dev fit. |
| 21 | **google-calendar** | productivity | 19 | E (`gapi.client.request` bridge) | MEDIUM | Highest-value Google surface; scheduling is a top agent task. Needs the gapi-bridge handler shape (distinct from fetch handlers) — budget design. |
| 22 | **linkedin** | comms/social | 7 | B (`JSESSIONID`-as-CSRF, same-origin) | EASY-but-CAUTION | Mechanically trivial (Pattern B). Include ONLY read ops; LinkedIn ToS is automation-hostile → keep writes denied. Borderline; could drop to keep the head clean. |

**Shortlist composition:** dev/source 4 (github, gitlab, circleci) + stretch (npm, docker-hub); PM 6 (linear, jira, asana, todoist, shortcut, confluence); cloud/infra 4 (vercel, netlify, cloudflare); observability 2 (datadog, sentry); db 2 (supabase, mongodb-atlas); docs/design 3 (notion, figma, google-calendar); comms 2 (slack, linkedin-read); finance-read 1 (stripe-read). 4 of these (github, gitlab→easy, notion, slack) are already done/trivial, so **net new hand-port effort ≈ 18 apps.**

**Stretch (port if cheap, defer otherwise):** `npm` (15, registry reads), `docker-hub` (13), `grafana` (30), `posthog` (39, analytics), `newrelic` (23), cloud consoles `azure`/`google-cloud`/`aws-console` (often Pattern-D/E, may be CORS-blocked; verify), `terraform-cloud` (39), `clickup` (Pattern-C WS token → DEFER, let T2 learn it).

**Explicitly NOT in the head (leave to T2-learned / T3-DOM):**
- **discord** (webpack-registry token — too brittle), **clickup** (WebSocket-captured JWT — needs live WS observation), and any Pattern-D app whose separate API origin does NOT send permissive CORS.
- All anti-feature apps (media, dating, social-write, finance-write) — denylisted, never ported.

---

## Feature Dependencies

```
Denylist expansion (deniedOrigins + sensitiveOrigins)
    └──MUST PRECEDE──> Any sensitive app reachable under Auto default
                           └──gates──> Descriptor import making apps invocable

Descriptor import (all 119, with sideEffectClass)
    └──requires──> Side-effect classification (read/write per op)
    └──requires──> Scaled search index (minisearch perf at ~2.5k docs)
    └──enables──> search_capabilities returns every app

Depth head (T1a/T1b hand-ports)
    └──requires──> Per-app CORS / first-party-origin verification (Pattern D gate)
    └──requires──> Token-redaction discipline + CI path-guard (no eval, no log)
    └──reuses────> slack.js handler contract (executeBoundSpec, origin-pin)

Seeded discovery (T2 learner)
    └──depends on──> 119 origins + endpoint hints seeded
    └──depends on──> Consent gate (Phase 30) already shipped
    └──covers─────> The tail NOT in the depth head

T3 DOM fallback (existing)
    └──enhances──> Every app (catches Pattern-C/D breakage)
```

### Dependency Notes
- **Denylist MUST precede invocability:** the shipped Auto default (v0.9.99 Phase 30) means an imported finance/health/dating descriptor is reachable the moment it's invocable. The denylist data has to land first. (Milestone already sequences this.)
- **Depth head requires the Pattern-D CORS gate:** porting linear/supabase/etc. without verifying the separate-origin CORS yields silent runtime failures. Linear documents its CORS in-source; supabase does not — verify each.
- **Descriptor import requires side-effect classification:** the consent policy keys off read/write; importing descriptors without trustworthy side-effect class breaks the safety model.
- **T3 DOM fallback enhances everything:** it's what makes the brittle Pattern-C/D apps acceptable to ship — they degrade instead of fail.

---

## MVP Definition

### Launch With (v1.0.0 core)
- [ ] **Denylist expansion** — deniedOrigins (media/dating/adult/finance-write/social-write) + sensitiveOrigins (messaging, finance-read, stripe/twilio writes). Lands FIRST. *Essential: legal + trust gate.*
- [ ] **Descriptor import for all ~117 real apps** (exclude e2e-test/prescript-test) with slug/service/synonyms/verb/sideEffectClass/params + MIT provenance. *Essential: this IS "OpenTabs parity / all apps discoverable."*
- [ ] **Scaled search index** performant at ~2,523 descriptors with stable `catalogVersion` + descriptor-vs-recipe side-effect cross-check. *Essential: SURF-04 must not regress.*
- [ ] **Depth head: the ~18 net-new T1a/T1b ports** from the shortlist (Pattern A/B + stable-C, CORS-verified). *Essential: "depth where users live."*
- [ ] **T1b recipe promotion** for same-origin cookie GET ops across imported apps (netlify reads, shortcut reads, etc.). *Essential: cheap breadth-into-depth.*
- [ ] **Seeded discovery** (119 origins + endpoint hints) for the tail. *Essential: "all apps usable" via the learner.*

### Add After Validation (v1.x)
- [ ] **Stretch ports** (grafana, posthog, newrelic, npm, docker-hub, mongodb-atlas, circleci) once the head pattern is proven and CORS-verified. *Trigger: depth-head ships clean + telemetry shows demand.*
- [ ] **gapi-bridge handler family** (google-calendar/docs/drive) as a distinct handler shape. *Trigger: validate one gapi bridge end-to-end first.*
- [ ] **Cloud-console ports** (azure, google-cloud, aws-console, terraform-cloud) — only after confirming their API proxies are same-origin/CORS-permissive. *Trigger: per-app CORS verification passes.*

### Future Consideration (v2+)
- [ ] **Pattern-C-hard ports** (discord webpack, clickup WS) — only if T2-learned proves insufficient. *Defer: brittleness not worth hand-maintenance.*
- [ ] **Per-op depth beyond the head** (porting more of datadog's 72 / linear's 60 ops) driven by usage telemetry. *Defer: import gives discoverability; deep-wire on demand.*
- [ ] **Carefully-gated finance/messaging WRITE ops** behind explicit per-call confirmation + vault. *Defer: high blast radius.*

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Denylist expansion (lands first) | HIGH | LOW | **P1** |
| Descriptor import (all 117 real apps) | HIGH | MEDIUM | **P1** |
| Scaled search index + side-effect cross-check | HIGH | MEDIUM | **P1** |
| Depth head — easy Pattern-A/B ports (jira, gitlab, sentry, vercel, netlify, confluence, todoist, shortcut, asana, figma) | HIGH | LOW-MEDIUM | **P1** |
| Depth head — flagship linear (CORS-documented) | HIGH | MEDIUM | **P1** |
| Depth head — datadog/cloudflare (live-rotating tokens) | HIGH | MEDIUM | **P1/P2** |
| T1b recipe promotion (same-origin GET ops) | MEDIUM | LOW | **P1** |
| Seeded discovery for the tail | HIGH | MEDIUM | **P1** |
| stripe-read / mongodb-atlas / circleci ports | MEDIUM | MEDIUM | **P2** |
| supabase port (CORS-conditional) | MEDIUM | MEDIUM (gated on CORS check) | **P2** |
| gapi-bridge (google-calendar/docs/drive) | HIGH | HIGH (new handler shape) | **P2** |
| Stretch observability/analytics ports (grafana, posthog, newrelic) | MEDIUM | MEDIUM | **P2** |
| Cloud-console ports (azure/gcloud/aws/terraform) | MEDIUM | HIGH (CORS-uncertain) | **P3** |
| discord/clickup hand-ports | LOW | HIGH (brittle) | **P3** (let T2 learn) |
| Deep per-op wiring beyond head | MEDIUM | HIGH | **P3** |

**Priority key:** P1 = must have for v1.0.0; P2 = add when head pattern proven; P3 = defer / let the learner handle.

---

## Competitor Feature Analysis

| Feature | OpenTabs (the source) | "Public-API" approach (naive MCP-per-API) | FSB's approach |
|---------|------------------------|-------------------------------------------|----------------|
| App coverage | 119 plugins, 2,523 ops, **one npm install per plugin** | Per-API server, per-API auth/OAuth setup | One extension; all 119 as descriptors; ~22 bundled depth; tail learned. **Zero installs.** |
| Auth | Page-context `fetchFromPage` (cookie/scraped token), CORS-bound | OAuth tokens you manage/store | Same page-context model (inherits the constraint) BUT origin-pinned + consent-gated + never-logged. |
| Cross-origin API | Works only where CORS permits (linear documented; cloudflare blocked) | Designed for separate API origins | **Forbidden** unless CORS-permissive + origin-pinned; otherwise demote to learned/DOM. |
| Breakage handling | Plugin fails (token moved / endpoint changed) | API version break → 4xx | **Self-healing T3 DOM fallback** still completes the task. |
| Catalog growth | New plugin = new npm package + release | New API = new server | **T2 learner** auto-grows from observed traffic, consent-gated. |
| Safety/supervision | Per-plugin, no unified gate | Per-server | **Unified Off/Ask/Auto + audit + denylist** across all apps. |
| MV3 compliance | N/A (their host model differs) | N/A | **Closed-vocabulary recipes = data**, no remotely-hosted code (Wall 1). |

---

## Sources

- **OpenTabs source, read directly via authenticated `gh` at `opentabs-dev/opentabs@main`** (HIGH confidence — primary source):
  - Plugin list: `gh api repos/opentabs-dev/opentabs/contents/plugins` (119 dirs incl. 2 test fixtures `e2e-test`, `prescript-test`).
  - Auth/transport `src/<app>-api.ts` inspected in full or grepped for: **linear, github, gitlab, vercel, datadog, stripe, jira, notion, supabase, sentry, cloudflare, netlify, clickup, todoist, asana, shortcut, confluence, figma, coinbase, robinhood, discord, telegram, x, linkedin, chatgpt, claude, google-calendar, google-docs, google-drive, airtable** (20 read in detail, 10 more grepped).
  - Transport SDK: `platform/plugin-sdk/src/fetch.ts` — confirmed `fetchFromPage`/`fetchJSON` are plain page-context `fetch()` with `credentials:'include'`, **no background proxy** (the load-bearing finding that maps OpenTabs' CORS reality onto FSB's MAIN-world Wall 2).
  - Op counts per app via `gh api .../src/tools --jq length` (HIGH — verified counts; cited inline in the shortlist).
  - Key in-source CORS quotes: linear-api.ts (`access-control-allow-origin: https://linear.app; access-control-allow-credentials: true … No fetchViaBackground needed`); cloudflare-api.ts (`Cross-origin requests to api.cloudflare.com are blocked by CORS`).
- **FSB-side anchors** (HIGH — read directly):
  - `extension/catalog/handlers/slack.js` — the T1a split-token handler contract (executeBoundSpec-only, origin-pin, no-log) the depth head must follow.
  - `extension/catalog/recipe-index.generated.js` — existing descriptor/recipe shapes + the github/notion/slack/reddit head precedent.
  - `.planning/PROJECT.md` — v1.0.0 framing, Wall 1/Wall 2, tier definitions, "port + learn not clone", denylist-first sequencing.
- **Confidence caveats:** auth pattern + tier mapping = HIGH (grounded in source). Per-app value ranking = MEDIUM (op counts verified; audience-fit is product judgement). supabase/mongodb-atlas/circleci/cloud-console portability = MEDIUM-to-LOW pending the explicit per-app CORS verification flagged as a P1/P2 dependency. ToS/sensitivity classification = HIGH (categorical).

---
*Feature research for: FSB v1.0.0 Full App Catalog (OpenTabs Parity) — auth-strategy → tier taxonomy, depth shortlist, anti-feature/denylist.*
*Researched: 2026-06-23*
