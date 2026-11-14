---
phase: 40-depth-1-top-read-hand-ports
plan: 03
subsystem: capability-catalog-handlers
tags: [depth-01, slack, extend-module, t1a, read, token-scrape]
requires:
  - catalog/handlers/slack.js callSlackMethod (xoxc scrape + body-placement)
  - tests/head-handler-upgrade.test.js (40-01)
provides:
  - slack.list_channels/list_members/get_channel_info as T1a READ heads on https://app.slack.com
  - each upgraded dom->T1a (slug byte-exact)
affects:
  - 40-05 (final battery)
tech-stack:
  added: []
  patterns:
    - token-scrape hand-port (callSlackMethod: xoxc in BODY, never a header/log)
key-files:
  created: []
  modified:
    - catalog/handlers/slack.js
    - extension/catalog/handlers/slack.js (build copy)
decisions:
  - "Reuse callSlackMethod unchanged; the 3 new slugs are just new handlers object keys (the registration loop walks them)"
  - "No new HEAD_HANDLER_MODULES entry (FsbHandlerSlack already present); no background.js change"
metrics:
  duration: ~7m
  completed: 2026-06-26
---

# Phase 40 Plan 03: Slack EXTEND Summary

EXTENDED the existing `FsbHandlerSlack` head with the 3 top READ opentabs slugs, reusing
the proven `callSlackMethod` token-scrape contract (origin `https://app.slack.com`, xoxc
scraped from the page into the request BODY, xoxd HttpOnly cookie rides same-origin). NO
new module -- these add slugs to the existing global, so `HEAD_HANDLER_MODULES` count is
UNCHANGED (still 4).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | add 3 slack READ slugs via callSlackMethod | 4ec6190c | catalog/handlers/slack.js |
| 2 | build ext copy + prove upgrade | 3f17714e | extension/catalog/handlers/slack.js |

## The 3 ported slugs (all upgraded dom->T1a, byte-exact)

| Slug | Slack web-API method | Origin |
| ---- | -------------------- | ------ |
| slack.list_channels | conversations.list | https://app.slack.com |
| slack.list_members | conversations.members | https://app.slack.com |
| slack.get_channel_info | conversations.info | https://app.slack.com |

The upgrade harness proves all 3 resolve `T1a` (was `T3`) byte-exact with a handler. 12/12
slack upgrade assertions PASS. They are DISTINCT from the existing head slug
`slack.conversations.list` (no collision).

## Security properties (SC2)

- **Token in BODY, never a header** -- the head-handlers test confirms the scraped xoxc
  rides the request body (a form field), not a header; the xoxd HttpOnly cookie rides
  same-origin automatically.
- **Never logged** -- no console call names xoxc/xoxd/token (the existing T-29-08 scan,
  re-asserted for the extend).
- **Origin-pinned** -- spec.origin = SLACK_ORIGIN via callSlackMethod; executeBoundSpec
  rejects a mismatch before executeScript.
- **READ-only** -- only conversations.* read methods; slack writes are Phase 41.
- **Fails closed** -- a missing xoxc returns RECIPE_DOM_FALLBACK_PENDING (reason
  `missing-slack-xoxc`) via the existing helper; no 200-with-logged-out-body false success.

## Wave-2 gate (all GREEN for 40-03)

- node tests/capability-head-handlers.test.js -- slack section PASS (notion scaffold still
  RED until 40-04; expected).
- node tests/head-handler-upgrade.test.js -- the 3 slack rows PASS byte-exact.
- node scripts/package-extension.mjs -- ext copy matches source.
- node tests/capability-router.test.js -- EXIT 0.
- npm run validate:extension -- EXIT 0 (slack.js already on the path-guard allowlist).

## Deviations from Plan

None -- plan executed exactly as written. The helpers, existing slugs, registration loop,
and dual export were left untouched (the loop walks the new keys); no HEAD_HANDLER_MODULES
or background.js change was needed.

## Out-of-scope (deferred)

- `showcase/angular/public/{sitemap.xml,llms-full.txt}` date bumps from package-extension --
  left UNSTAGED (see deferred-items.md).

## Self-Check: PASSED

- Files: catalog/handlers/slack.js, extension/catalog/handlers/slack.js -- FOUND, ext copy
  carries all 3 slugs.
- Commits: 4ec6190c, 3f17714e -- all FOUND.
