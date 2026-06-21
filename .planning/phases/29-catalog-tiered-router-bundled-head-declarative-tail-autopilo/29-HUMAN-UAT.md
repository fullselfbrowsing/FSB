---
phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
plan: 03
status: human_needed
created: 2026-06-21
---

# Phase 29 Plan 03 Human UAT: Bundled-Head [ASSUMED] Internal-Endpoint Live Capture

This is the live half of 29-03 Task 4 (a `checkpoint:human-verify`). It was NOT executed in the autonomous, no-live-browser run and must not be treated as passed until a human records the observed result. It is recorded here as `human_needed` live-UAT, matching the Phase 27/28 posture (the live half is documented debt, not a fabricated pass; it does NOT block the headless CI gate).

## Why this is human_needed (not CI-provable)

The zero-install bundled head ships five services exercising every mechanism class:

| Service | Slug(s) | Tier | First-party origin (pin target) | Internal endpoint [ASSUMED] |
|---------|---------|------|---------------------------------|-----------------------------|
| GitHub notifications | `github.notifications` | T1b | `https://github.com` | `GET /notifications` (already Phase-27 proven) |
| GitHub issues | `github.issues.list` / `github.issues.create` | T1a | `https://github.com` | `GET /issues` read; `POST /_graphql` persisted-query + CSRF scrape |
| Slack | `slack.conversations.list` / `slack.chat.postMessage` | T1a | `https://app.slack.com` | `POST /api/<method>`; xoxc in BODY, xoxd HttpOnly cookie |
| Notion | `notion.getSpaces` / `notion.loadPage` | T1a | `https://www.notion.so` | `POST /api/v3/<op>`; token_v2 HttpOnly cookie |
| Reddit inbox | `reddit.inbox` | T1b | `https://www.reddit.com` | `GET /message/unread.json` |

The CI suite proves every FSB-owned mechanic headlessly through mocks/stubs/fixtures:
`tests/capability-router.test.js` (24/0) proves the catalog T1a dispatch + the active-tab origin-pin (a handler `spec.origin != active-tab origin` returns `RECIPE_ORIGIN_MISMATCH` with NO `executeScript` side effect — the router is not a pin bypass); `tests/capability-head-handlers.test.js` (54/0) proves each handler builds a spec pinned to its first-party origin, calls `ctx.executeBoundSpec` (never injects into a page itself), places the Slack xoxc token in the BODY (not a header), never logs a token-bearing variable (T-29-08), and that the Reddit recipe is schema-valid; `tests/capability-recipe-schema.test.js` (43/0) re-proves the closed-vocabulary gate.

The ONE class of property the CI suite CANNOT prove is the irreducibly-live one: that each service's `[ASSUMED]` INTERNAL endpoint PATH (training/inference-derived per RESEARCH Assumptions A2/A3/A4) is the REAL path the frontend uses, and that the first-party HttpOnly credential (`_gh_sess`/`logged_in`, `xoxd`+`xoxc`, `token_v2`, the reddit session cookie) actually attaches in the page MAIN world and returns a LOGGED-IN body shape (not a login redirect). Capturing the real internal request requires real credentials in a live authenticated tab, which cannot ship to CI (forbidden, GOV-06). The origin-SEPARATION facts (api.github.com / oauth.reddit.com / api.notion.com are separate origins and are NOT used) ARE web-search-verified; the internal endpoint PATHS are not.

Every `[ASSUMED]` endpoint path, CSRF/token carrier, and request body shape in the handlers is tagged in source with a `[ASSUMED-ENDPOINT: capture live in 29-03 Task 4]` comment for the capture below.

## Setup

1. Load `extension/` as an unpacked Chrome extension (per the project FSB browser-automation policy, drive these via the FSB MCP browser tools).
2. For each service: sign in to that service's web app in a normal `https://` tab and keep that tab ACTIVE (the two-point origin-pin requires the active-tab origin to equal the handler's declared origin; `executeBoundSpec` re-asserts `chrome.tabs.get(tabId).url` origin === `spec.origin` before any side effect).
3. Invoke each slug through the capability engine (`FsbCapabilityRouter.invoke(slug, args, { origin, tabId })` — the same front door the MCP `invoke_capability` dispatcher and the autopilot branch share).
4. Use DevTools Network to capture the REAL request the service's own frontend issues for the same operation, and compare it to the handler's `[ASSUMED]` spec.
5. NEVER record or paste a real token value into this file — record only the token LOCATION/shape (logged-in vs logged-out), redacted.

## Required Scenarios

| ID | Service | Procedure | Expected Outcome | Status |
|----|---------|-----------|------------------|--------|
| UAT-29-01 | GitHub issues (T1a) | Signed in to github.com, active tab on `https://github.com`. Invoke `github.issues.list`. For `github.issues.create`, in DevTools capture the REAL `/_graphql` persisted-query request the GitHub frontend issues when you create an issue, and the CSRF token source/header name it uses. Update the `[ASSUMED-ENDPOINT]` paths/headers/body in `catalog/handlers/github.js` to the captured values. | `github.issues.list` returns a LOGGED-IN issues shape (real data, not a `/login` redirect). The captured `/_graphql` path, CSRF header name, and persisted-query body match (or replace) the `[ASSUMED]` values. | human_needed |
| UAT-29-02 | Slack (T1a split-token) | Signed in to app.slack.com, active tab on `https://app.slack.com`. Invoke `slack.conversations.list`. In DevTools confirm the real web-API method path (`/api/conversations.list` / `/api/chat.postMessage`), confirm `xoxc` is carried in the request BODY and `xoxd` rides as an HttpOnly cookie, and capture the real xoxc page location. Update `catalog/handlers/slack.js`. | `slack.conversations.list` returns a LOGGED-IN conversations shape. The xoxc-in-body + xoxd-cookie split is confirmed against the live request; the `[ASSUMED]` method path / xoxc location are confirmed or corrected. | human_needed |
| UAT-29-03 | Notion (T1a /api/v3) | Signed in to www.notion.so, active tab on `https://www.notion.so`. Invoke `notion.getSpaces`. In DevTools capture the real `/api/v3/getSpaces` request shape and confirm `token_v2` rides as an HttpOnly cookie. Update `catalog/handlers/notion.js`. | `notion.getSpaces` returns LOGGED-IN space data (not an auth error). The `/api/v3/getSpaces` path + body shape are confirmed or corrected; token_v2 confirmed as the carrier. | human_needed |
| UAT-29-04 | Reddit inbox (T1b) | Signed in to www.reddit.com, active tab on `https://www.reddit.com`. Invoke `reddit.inbox`. Confirm `GET /message/unread.json` returns LOGGED-IN inbox JSON (not a login redirect or an HTML page). Confirm/adjust `catalog/recipes/reddit-inbox.json`. | `GET /message/unread.json` returns the logged-in inbox JSON shape. The legacy `.json` same-origin endpoint is confirmed still served; if removed, drop reddit from the head (the architecture is already proven by the other recipes/handlers). | human_needed |
| UAT-29-05 | Origin-pin live (any T1a head) | Put the active tab on a NON-matching origin (any other `https://` site) and invoke any T1a head slug (e.g. `slack.conversations.list` with the active tab on github.com). | `RECIPE_ORIGIN_MISMATCH` (both `code` and `errorCode`); NO request is fired and NO `executeScript` side effect occurs (the active-tab origin != `spec.origin` short-circuits in `executeBoundSpec` before injection). Confirms the pin holds live on the head path. | human_needed |

## Deferral note (per CONTEXT)

If a service's internal endpoint cannot be captured (rate-limited / obfuscated — Gmail and Linear were excluded from the MVP head for exactly this reason), record it as deferred and note that the DOM-fallback floor (Phase 32, T3) covers it. The five MVP head services were chosen because their internal surfaces are the most durable/capturable (GitHub/Reddit REST-ish and `.json`, Slack/Notion stable-but-undocumented `/api`).

## Recording Results

When executed, replace each `human_needed` status with `pass`, `fail`, or `partial`, and add the date, Chrome version, extension commit, and a short observed-outcome note (the observed HTTP status, logged-in vs logged-out shape, and whether the `[ASSUMED]` endpoint matched or was corrected — redacted to shape, never the literal token/username). Before recording, re-verify each service's web-UI behavior at run time, since these frontends change. Do NOT mark the 29-03 Task 4 live-capture assertion complete until each head service has a recorded outcome (or a documented deferral). The headless CI gate (router 24/0, head-handlers 54/0, recipe-schema 43/0, recipe-path-guard PASS) does NOT depend on this step.
