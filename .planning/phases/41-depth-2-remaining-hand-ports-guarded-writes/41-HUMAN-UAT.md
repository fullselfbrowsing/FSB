---
phase: 41-depth-2-remaining-hand-ports-guarded-writes
plan: 02, 04
status: human_needed
created: 2026-06-26
---

# Phase 41 Human UAT: Guarded-Write [ASSUMED-ENDPOINT] Live Mutation-Body Capture

This is the live half of the Phase 41 guarded writes (DEPTH-02). It was NOT executed in the
autonomous, no-live-browser run and must not be treated as passed until a human records the
observed result. It is recorded here as `human_needed` live-UAT, matching the Phase 29/40
posture (the live half is documented debt, not a fabricated pass; it does NOT block the
headless CI gate). The gitlab rows are added by Plan 02; the notion + slack rows are
consolidated by Plan 04.

## Why this is human_needed (not CI-provable)

Every guarded WRITE shipped this milestone ships **FAIL-CLOSED** (the github.issues.create
pattern): `handle()` returns the dual-field `RECIPE_DOM_FALLBACK_PENDING` and **NEVER** calls
`ctx.executeBoundSpec`, so **NO mutation fires** until a live-captured request body confirms
the exact `[ASSUMED-ENDPOINT]` method/path/body for that app. The CI suite proves the
fail-closed contract headlessly (`tests/guarded-write-failclosed.test.js` asserts the
executeBoundSpec recorder stays EMPTY for each write; `tests/head-handler-upgrade.test.js`
proves each slug upgrades dom->T1a with a write class; the SC2 consent gate is proven in
`tests/sensitive-write-import-gate.test.js`). The ONE class of property CI cannot prove is the
irreducibly-live one: that each write's `[ASSUMED]` INTERNAL endpoint path + request body
(incl. the CSRF/token placement) is the REAL shape the app's own frontend issues for that
mutation on a live authenticated tab. Capturing the real internal mutation requires real
credentials in a live authenticated tab, which cannot ship to CI (forbidden, GOV-06).

The writes ship INERT: nothing mutates until each body is captured and a future flip activates
the handler. This is **carried-forward, user-gated UAT debt**, consistent with Phase 40's
live-UAT posture, and is **NON-blocking for CI** (the headless gates pass; every write returns
`RECIPE_DOM_FALLBACK_PENDING`).

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

## Required Scenarios (guarded writes)

| ID | Service | op (slug) | Procedure | Expected | Status |
|----|---------|-----------|-----------|----------|--------|
| UAT-41-01 | GitLab | `gitlab.create_issue` | On an authenticated gitlab.com tab, capture the REAL mutation request (method/path/body incl the CSRF token placement) the GitLab frontend issues when you create an issue, via the network-capture path; record the observed shape redacted + date + Chrome version + commit. The same-origin base is `https://gitlab.com/api/v4` (gitlab-api.ts:13). | The `[ASSUMED-ENDPOINT]` `POST /api/v4/projects/:id/issues` body is confirmed (or corrected); a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
| UAT-41-02 | GitLab | `gitlab.create_merge_request` | On an authenticated gitlab.com tab, capture the REAL create-merge-request mutation (method/path/body incl CSRF placement) via the network-capture path; record redacted + date + Chrome version + commit. | The `[ASSUMED-ENDPOINT]` `POST /api/v4/projects/:id/merge_requests` body is confirmed; a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
| UAT-41-03 | GitLab | `gitlab.create_note` | On an authenticated gitlab.com tab, capture the REAL add-note (comment to an issue/MR) mutation (method/path/body incl CSRF placement) via the network-capture path; record redacted + date + Chrome version + commit. | The `[ASSUMED-ENDPOINT]` `POST /api/v4/projects/:id/issues/:iid/notes` (or `.../merge_requests/:iid/notes`) body is confirmed; a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
| UAT-41-04 | Notion | `notion.create_page` | On an authenticated www.notion.so tab, capture the REAL `/api/v3` submitTransaction RPC body the Notion frontend issues when you create a page (op + transaction/operation shape; token_v2 rides as an HttpOnly cookie); record redacted + date + Chrome version + commit. The same-origin base is `https://www.notion.so/api/v3` (notion-api.ts:102). | The `[ASSUMED-ENDPOINT]` POST /api/v3 submitTransaction body is confirmed; a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
| UAT-41-05 | Notion | `notion.update_page` | On an authenticated www.notion.so tab, capture the REAL `/api/v3` submitTransaction RPC body for a page title/icon/cover update; record redacted + date + Chrome version + commit. | The `[ASSUMED-ENDPOINT]` POST /api/v3 submitTransaction (page update) body is confirmed; a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
| UAT-41-06 | Notion | `notion.create_database_item` | On an authenticated www.notion.so tab, capture the REAL `/api/v3` submitTransaction RPC body for adding a row/item to a database; record redacted + date + Chrome version + commit. | The `[ASSUMED-ENDPOINT]` POST /api/v3 submitTransaction (row insert) body is confirmed; a future flip activates the handler. | human_needed (writes ship FAIL-CLOSED — nothing mutates until capture) |
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
