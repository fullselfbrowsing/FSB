---
phase: 41-depth-2-remaining-hand-ports-guarded-writes
plan: 02, 04
status: partial
created: 2026-06-26
updated: 2026-06-29
result: "Notion loaded-extension invoke_capability smoke passed on app.notion.com for create_page, update_page, create_database, and create_database_item. GitLab and Slack guarded-write capture remain human_needed."
---

# Phase 41 Human UAT: Guarded-Write [ASSUMED-ENDPOINT] Live Mutation-Body Capture

This is the live half of the Phase 41 guarded writes (DEPTH-02). It was NOT executed in the
autonomous, no-live-browser run and must not be treated as passed until a human records the
observed result. It is recorded here as `human_needed` live-UAT, matching the Phase 29/40
posture (the live half is documented debt, not a fabricated pass; it does NOT block the
headless CI gate). The gitlab rows are added by Plan 02; the notion + slack rows are
consolidated by Plan 04.

## Why this is human_needed (not CI-provable)

The remaining GitLab and Slack guarded writes still ship **FAIL-CLOSED** (the
github.issues.create pattern): `handle()` returns the dual-field
`RECIPE_DOM_FALLBACK_PENDING` and **NEVER** calls `ctx.executeBoundSpec`, so **NO mutation
fires** until a live-captured request body confirms the exact `[ASSUMED-ENDPOINT]`
method/path/body for that app. The CI suite proves that remaining fail-closed contract
headlessly (`tests/guarded-write-failclosed.test.js` asserts the executeBoundSpec recorder
stays EMPTY for those writes; `tests/head-handler-upgrade.test.js` proves each slug upgrades
dom->T1a with a write class; the SC2 consent gate is proven in
`tests/sensitive-write-import-gate.test.js`).

Notion is now different: the 2026-06-29 same-origin API smoke found the current live runtime
(`https://app.notion.com`, `/api/v3/saveTransactions`, and `command:"set"` for title/icon/cover
paths), and the patched handler activates only the four UAT-smoked Notion writes. The ONE class
of property CI still cannot prove is the irreducibly-live one: that the currently loaded Chrome
extension, after reload, can execute those handlers against a real authenticated Notion tab via
`invoke_capability`. That live loaded-extension smoke requires real credentials and must be
recorded here separately; it is **NON-blocking for CI**.

## Setup

1. Load `extension/` as an unpacked Chrome extension (drive these via the FSB MCP browser tools
   per the project browser-automation policy).
2. For each service: sign in to that service's web app in a normal `https://` tab and keep that
   tab ACTIVE (the two-point origin-pin requires the active-tab origin to equal the handler's
   declared first-party origin).
3. Use DevTools Network to capture the REAL request the service's own frontend issues for the
   same WRITE operation, and compare it to the handler's `[ASSUMED-ENDPOINT]` expectation.
4. NEVER record or paste a real token/CSRF/cookie value into this file — record only the
   token/CSRF LOCATION/shape (logged-in vs logged-out, header vs body vs cookie), redacted.

## Observed 2026-06-29 Notion Preflight + API Smoke

Using the loaded FSB extension through the MCP bridge (`execute_js`, `search_capabilities`,
and `invoke_capability`), the Notion login/app route was opened with
`https://www.notion.so/login`. The browser reached an authenticated Notion workspace surface,
but the live origin was `https://app.notion.com`, not the handler/UAT origin
`https://www.notion.so`. The sanitized readiness probe reported `likelySignedIn:true` without
recording page text, workspace names, cookies, tokens, or localStorage contents. Resource-timing
metadata also showed current `/api/v3` traffic on `https://app.notion.com`, with read paths such
as `/api/v3/getAppConfig`, `/api/v3/getSpacesInitial`, and `/api/v3/loadCachedPageChunkV2`.

`search_capabilities` returned the Notion write slugs (`notion.create_page`,
`notion.update_page`, and `notion.create_database_item`) only as broad DOM descriptors with
`backingStatus:"discovery-pending"` and `invocable:false`. Direct `invoke_capability` attempts
for `notion.create_page`, `notion.update_page`, and `notion.create_database_item` returned
`RECIPE_DOM_FALLBACK_PENDING`, so the shipped handlers did not perform Notion mutations.

At the user's request, a disposable Notion API smoke was run from the authenticated Notion tab
using the same-origin page context. The old `/api/v3/submitTransaction` endpoint returned 404;
the current live endpoint is `/api/v3/saveTransactions`. Notion currently rejects property-array
title writes sent as `command:"update"`; changing title property writes to `command:"set"` made
the smoke pass. The smoke intentionally created a disposable page titled
`FSB API Smoke Test 2026-06-29T09-51-03-257Z - Updated`, appended five blocks, created a
database, inserted one database row, and verified the page/database/row via
`/api/v3/getRecordValues`. No literal cookie, token, CSRF, user id, workspace id, or credential
value was recorded in this UAT note.

Result at that point: Notion's same-origin API shape was partially verified on
`https://app.notion.com`, but the then-loaded Notion capability handlers remained fail-closed
and the original "capture the REAL frontend-issued mutation body" UAT was still not complete.

Run metadata: Chrome 149.0.7827.200; extension commit `3ff5b2c2`; MCP package/server
`0.10.0`; date 2026-06-29.

## Patch Update 2026-06-29

Implemented the Notion runtime reconciliation in the workspace:

- Handler origin and manifest now pin Notion to `https://app.notion.com`.
- Active Notion write slugs: `notion.create_page`, `notion.update_page`,
  `notion.create_database`, and `notion.create_database_item`.
- Writes use `POST /api/v3/saveTransactions`, resolve `userId`/`spaceId` from
  `getSpaces`/`getSpacesInitial`, send active user/space headers only inside the bound spec,
  and verify records with `getRecordValues`.
- Title/icon/cover paths use `command:"set"`; object metadata uses `command:"update"`.
- The origin classifier has a Notion-only observed-runtime override for
  `https://app.notion.com/api/v3`; the general same-origin gate remains unchanged.

Headless verification passed:

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/consent-mutation-gate.test.js`
- `npm run validate:extension`

The first loaded-extension retry after copying the patch into the Desktop hotload folder reached
the new T1a handler, but `notion.create_page` returned
`RECIPE_DOM_FALLBACK_PENDING` with `reason:"notion-session-unavailable"`. Root cause: the shared
`executeBoundSpec` primitive caps response text at 256 KB before JSON parsing, while Notion's
current `getSpaces` payload can be larger. The response still contained the same-origin JSON text
prefix needed to resolve active user and space ids. The handler was patched to resolve session
metadata from that capped same-origin text fallback when `data` is null; no cookie, token, page
text, workspace name, or credential value is read or recorded.

## Observed 2026-06-29 Loaded-Extension Notion Invoke Smoke

Hotloaded extension path: `/Users/lakshman/Desktop/fsb-extension-v0.9.90`; extension id
`ohhdehopldgibhmbiiobdggcglpjiepp`. After syncing the patched handler, Chrome reloaded the
service worker and the MCP status probe reported `extensionConnected:true`,
`lastWakeReason:"runtime.onInstalled"`, and `lastConnectedAt:"2026-06-29T15:22:43.544Z"`.

The final live smoke opened an authenticated `https://app.notion.com` tab through the MCP
`navigate` tool. The sanitized readiness probe reported `origin:"https://app.notion.com"` and
`likelySignedIn:true` without recording page text, workspace names, cookies, tokens, localStorage,
user ids, or workspace ids.

`invoke_capability` then executed the four activated Notion slugs through the loaded extension:

- `notion.create_page` returned `success:true`, `tier:"T1a"`, created disposable page
  `c03015b2-fcd8-4c81-9763-29f4ec260e38`, and verified it with `getRecordValues`.
- `notion.update_page` returned `success:true`, `tier:"T1a"` for the same page after setting
  title, icon, and cover.
- `notion.create_database` returned `success:true`, `tier:"T1a"`, created disposable database
  `0ece36a9-920f-471b-8ecb-24a30035a2a3`, and verified the collection.
- `notion.create_database_item` returned `success:true`, `tier:"T1a"`, created disposable row
  `0dc2f7e3-2f94-41f9-b329-3dc023ec62aa`, and verified the row.

Residual observation: `search_capabilities` still surfaces the broad OpenTabs Notion descriptors
as `backing:"dom"`, `backingStatus:"discovery-pending"`, and `invocable:false`; direct
`invoke_capability` by slug resolves and executes the T1a handlers correctly. This is a search
metadata/UI surfacing mismatch, not a handler runtime failure.

## Required Scenarios (guarded writes)

| ID | Service | op (slug) | Procedure | Expected | Status |
|----|---------|-----------|-----------|----------|--------|
| UAT-41-01 | GitLab | `gitlab.create_issue` | On an authenticated gitlab.com tab, capture the REAL mutation request (method/path/body incl the CSRF token placement) the GitLab frontend issues when you create an issue, via the network-capture path; record the observed shape redacted + date + Chrome version + commit. The same-origin base is `https://gitlab.com/api/v4` (gitlab-api.ts:13). | The `[ASSUMED-ENDPOINT]` `POST /api/v4/projects/:id/issues` body is confirmed (or corrected); a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
| UAT-41-02 | GitLab | `gitlab.create_merge_request` | On an authenticated gitlab.com tab, capture the REAL create-merge-request mutation (method/path/body incl CSRF placement) via the network-capture path; record redacted + date + Chrome version + commit. | The `[ASSUMED-ENDPOINT]` `POST /api/v4/projects/:id/merge_requests` body is confirmed; a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
| UAT-41-03 | GitLab | `gitlab.create_note` | On an authenticated gitlab.com tab, capture the REAL add-note (comment to an issue/MR) mutation (method/path/body incl CSRF placement) via the network-capture path; record redacted + date + Chrome version + commit. | The `[ASSUMED-ENDPOINT]` `POST /api/v4/projects/:id/issues/:iid/notes` (or `.../merge_requests/:iid/notes`) body is confirmed; a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
| UAT-41-04 | Notion | `notion.create_page` | After reloading the patched extension, open an authenticated `https://app.notion.com` tab and invoke the capability with a disposable title/content. Record the created page URL/id only if needed for follow-on rows; do not record user/workspace ids or cookies. | `invoke_capability` calls `/api/v3/saveTransactions`, creates a disposable page, and verifies it with `/api/v3/getRecordValues`. | pass 2026-06-29 — loaded extension returned `success:true`, `tier:"T1a"` for page `c03015b2-fcd8-4c81-9763-29f4ec260e38`; no secrets recorded |
| UAT-41-05 | Notion | `notion.update_page` | Use the disposable page from UAT-41-04 and invoke a title/icon/cover update. | `invoke_capability` uses `command:"set"` for `properties.title`, `format.page_icon`, and `format.page_cover`, then verifies the page. | pass 2026-06-29 — loaded extension returned `success:true`, `tier:"T1a"` after title/icon/cover update |
| UAT-41-06 | Notion | `notion.create_database` | Use the disposable page from UAT-41-04 and invoke database creation with a small schema such as `{ "Status": "text" }`. | `invoke_capability` creates collection, collection_view_page, and collection_view records through `/api/v3/saveTransactions`, then verifies the collection. | pass 2026-06-29 — loaded extension returned `success:true`, `tier:"T1a"` for database `0ece36a9-920f-471b-8ecb-24a30035a2a3` |
| UAT-41-06a | Notion | `notion.create_database_item` | Use the disposable database from UAT-41-06 and invoke row creation with a mapped property such as `{ "Status": "Created" }`. | `invoke_capability` maps property names through the collection schema, inserts the row through `/api/v3/saveTransactions`, and verifies the row. | pass 2026-06-29 — loaded extension returned `success:true`, `tier:"T1a"` for row `0dc2f7e3-2f94-41f9-b329-3dc023ec62aa` |
| UAT-41-07 | Slack | `slack.send_message` | On an authenticated app.slack.com tab, capture the REAL `chat.postMessage` web-API request the Slack frontend issues when you send a message — confirm the `/api/<method>` path, that the `xoxc` token rides in the BODY (form field, not a header) and `xoxd` rides as an HttpOnly cookie; record the token LOCATION/shape redacted (never the literal token) + date + Chrome version + commit. The same-origin base is `https://app.slack.com/api/<method>`. | The `[ASSUMED-ENDPOINT]` form-body (incl the xoxc-in-body placement) is confirmed; a future flip activates the handler. NOTE: slack.send_message is ALSO the SC2 sensitive-origin proof vehicle — its consent-gate behavior (mutating-gated on app.slack.com) is CI-proven in `tests/sensitive-write-import-gate.test.js`; ONLY its mutation body is human_needed. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |

## Recording Results

When executed, replace each `human_needed` status with `pass`, `fail`, or `partial`, and add
the date, Chrome version, extension commit, and a short observed-outcome note (the observed
HTTP method/path, whether the `[ASSUMED]` endpoint/body matched or was corrected, and the
CSRF/token placement — redacted to shape, never the literal token/cookie). Before recording,
re-verify the app's web-UI mutation behavior at run time, since these frontends change. Do NOT
mark a guarded write activated until its body is captured AND a deliberate flip (the future
story) makes it executable. The headless CI gate does NOT depend on this step (the writes are
fail-closed).
