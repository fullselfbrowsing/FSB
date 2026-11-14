---
phase: 40-depth-1-top-read-hand-ports
plan: 04
subsystem: capability-catalog-handlers
tags: [depth-01, notion, extend-module, t1a, read, rpc]
requires:
  - catalog/handlers/notion.js buildRpcSpec (/api/v3 POST RPC, token_v2 cookie)
  - tests/head-handler-upgrade.test.js (40-01)
provides:
  - notion.search/get_database as T1a READ heads on https://www.notion.so
  - each upgraded dom->T1a (slug byte-exact); the upgrade harness now FULLY GREEN (48/0)
affects:
  - 40-05 (final battery)
tech-stack:
  added: []
  patterns:
    - JSON-body/RPC hand-port (buildRpcSpec POST same-origin /api/v3)
    - per-handler logged-out RPC shape guard (non-null object/array required)
key-files:
  created: []
  modified:
    - catalog/handlers/notion.js
    - extension/catalog/handlers/notion.js (build copy)
decisions:
  - "search RPC op 'search' + record-fetch op 'getRecordValues' are [ASSUMED] (live UAT debt) exactly like notion.getSpaces/loadPage"
  - "Added typedRecipeError + guardRpcShape to notion.js (it had neither); existing slugs/buildRpcSpec untouched"
metrics:
  duration: ~8m
  completed: 2026-06-26
---

# Phase 40 Plan 04: Notion EXTEND Summary

EXTENDED the existing `FsbHandlerNotion` head with the 2 top READ opentabs slugs, reusing
the proven `buildRpcSpec` contract (origin `https://www.notion.so`, POST same-origin
`/api/v3` RPC, the `token_v2` HttpOnly cookie rides automatically). NO new module --
`HEAD_HANDLER_MODULES` count is UNCHANGED (still 4). With this plan the upgrade harness is
FULLY GREEN (all 10 slugs upgraded dom->T1a).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | add 2 notion READ slugs via buildRpcSpec | cb9e5b36 | catalog/handlers/notion.js |
| 2 | build ext copy + prove upgrade (full green) | 856db643 | extension/catalog/handlers/notion.js |

## The 2 ported slugs (both upgraded dom->T1a, byte-exact)

| Slug | /api/v3 RPC op | Origin |
| ---- | -------------- | ------ |
| notion.search | search | https://www.notion.so |
| notion.get_database | getRecordValues | https://www.notion.so |

The upgrade harness proves both resolve `T1a` (was `T3`) byte-exact with a handler; they are
DISTINCT from the existing head slugs `notion.getSpaces`/`notion.loadPage` (no collision).
The BEFORE(T3)/AFTER(T1a) leg (which uses notion.search) now flips GREEN -> the harness is
48/0.

## Security properties (SC2)

- **Same-origin /api/v3 only** -- via buildRpcSpec; the source scan confirms NO separate
  api-host literal; NO chrome.scripting/tabs.
- **executeBoundSpec-only** -- each read calls executeBoundSpec exactly once; origin-pinned
  to www.notion.so (RECIPE_ORIGIN_MISMATCH before executeScript).
- **token_v2 cookie-borne** -- no scraped token; the HttpOnly cookie authenticates
  same-origin (no token in any header or log).
- **READ-only** -- the search + record-fetch READ RPCs only; notion writes are Phase 41.
- **Logged-out guard** -- guardRpcShape rejects a non-object/array body (a logged-out
  redirect) with RECIPE_DOM_FALLBACK_PENDING (reason `notion-logged-out-or-rot`). No
  200-with-logged-out-body false success.

## Wave-2 gate (all GREEN for 40-04)

- node tests/capability-head-handlers.test.js -- EXIT 0 (notion section + WHOLE suite green).
- node tests/head-handler-upgrade.test.js -- EXIT 0, FULLY GREEN (48/0; all 10 slugs T1a +
  negative control + BEFORE/AFTER).
- node tests/head-handler-cap.test.js -- EXIT 0 (4 modules, CAP 30).
- node tests/capability-router.test.js -- EXIT 0.
- npm run validate:extension -- EXIT 0 (notion.js already on the path-guard allowlist).

## Live-UAT debt (carried forward)

The exact `/api/v3` op name + body shape for `search` ('search') and `get_database`
('getRecordValues') are [ASSUMED] -- training/inference-derived, exactly like the existing
notion.getSpaces/loadPage. Live endpoint-correctness on an authenticated www.notion.so tab
is carried-forward, user-gated UAT debt (40-VALIDATION.md Manual-Only). The handler ships
FAIL-CLOSED via guardRpcShape so security holds regardless.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical] Added typedRecipeError + guardRpcShape to notion.js**
- **Found during:** Task 1
- **Issue:** The plan's `<behavior>` mandates a logged-out shape guard returning the
  dual-field RECIPE_DOM_FALLBACK_PENDING, but notion.js had neither a typedRecipeError
  helper nor any shape guard (the original 2 slugs returned executeBoundSpec verbatim).
- **Fix:** Added a `typedRecipeError(code, extra)` helper (mirroring github.js/slack.js) and
  a `guardRpcShape(result, slug)` that rejects a non-object/array body. Applied to both new
  slugs. The existing notion.getSpaces/loadPage + buildRpcSpec were left untouched.
- **Files modified:** catalog/handlers/notion.js
- **Commit:** cb9e5b36

## Out-of-scope (deferred)

- `showcase/angular/public/{sitemap.xml,llms-full.txt}` date bumps from package-extension --
  left UNSTAGED (see deferred-items.md).

## Self-Check: PASSED

- Files: catalog/handlers/notion.js, extension/catalog/handlers/notion.js -- FOUND.
- Commits: cb9e5b36, 856db643 -- all FOUND.
