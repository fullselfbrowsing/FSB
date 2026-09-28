---
phase: 40-depth-1-top-read-hand-ports
plan: 02
subsystem: capability-catalog-handlers
tags: [depth-01, gitlab, new-module, t1a, read, same-origin]
requires:
  - tests/head-handler-upgrade.test.js (40-01)
  - capability-catalog.js resolve() REGISTRY-first upgrade + registerHandler + seedHeadHandlers
  - capability-fetch.js executeBoundSpec origin-pin
provides:
  - catalog/handlers/gitlab.js (5 READ T1a heads on https://gitlab.com/api/v4)
  - HEAD_HANDLER_MODULES FsbHandlerGitlab (4th module, <=30)
  - gitlab.list_projects/get_project/list_issues/get_issue/list_merge_requests upgraded dom->T1a
affects:
  - 40-05 (the final battery requires all 10 slugs T1a)
tech-stack:
  added: []
  patterns:
    - GitHub-GET hand-port template (one GET spec, executeBoundSpec once)
    - per-handler logged-out shape guard (array for list_*, id-object for get_*)
key-files:
  created:
    - catalog/handlers/gitlab.js
    - extension/catalog/handlers/gitlab.js (build copy)
  modified:
    - extension/utils/capability-catalog.js
    - extension/background.js
    - scripts/verify-recipe-path-guard.mjs
decisions:
  - "GitLab is the same-origin replacement for linear (linear's GraphQL is a separate client-api subdomain = Phase 41 CORS-gate)"
  - "logged-out guard checks executeBoundSpec result.data shape (array vs id-object) -> RECIPE_DOM_FALLBACK_PENDING on a wrong shape"
metrics:
  duration: ~14m
  completed: 2026-06-26
---

# Phase 40 Plan 02: GitLab NEW Head Module Summary

Ported GitLab's top 5 READ ops as first-class T1a heads via the GitHub-GET contract, on
GitLab's OWN first-party origin `https://gitlab.com` (same-origin REST at `/api/v4`,
verified in the vendored source) -- each UPGRADING its existing `opentabs__gitlab__*`
breadth descriptor `dom`->`T1a` by registering the EXACT dot-form slug. GitLab is the
same-origin replacement for the deferred linear (whose GraphQL is a separate client-api
subdomain -- Phase 41 CORS-gate material).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | gitlab.js: 5 READ T1a handlers | 9e8cad5a | catalog/handlers/gitlab.js |
| 2 | register FsbHandlerGitlab + background.js load | 0f47d417 | capability-catalog.js, background.js, extension/.../gitlab.js |
| 3 | prove upgrade + path-guard allowlist fix | 54c5ea2d | scripts/verify-recipe-path-guard.mjs |

## The 5 ported slugs (all upgraded dom->T1a, byte-exact)

| Slug | Method | Path | Origin |
| ---- | ------ | ---- | ------ |
| gitlab.list_projects | GET | /api/v4/projects | https://gitlab.com |
| gitlab.get_project | GET | /api/v4/projects/:id | https://gitlab.com |
| gitlab.list_issues | GET | /api/v4/projects/:id/issues | https://gitlab.com |
| gitlab.get_issue | GET | /api/v4/projects/:id/issues/:iid | https://gitlab.com |
| gitlab.list_merge_requests | GET | /api/v4/projects/:id/merge_requests | https://gitlab.com |

The upgrade harness proves all 5 resolve `T1a` (was `T3`) with a BYTE-EXACT descriptor.slug
and a handler with an async handle, on the first-party origin (Wall 2). 20/20 gitlab
assertions PASS.

## Security properties (SC2)

- **Same-origin /api/v4 only** -- a PATH on gitlab.com, NOT a separate api-host subdomain.
  The source scan confirms NO separate api-host literal appears; NO chrome.scripting/tabs.
- **executeBoundSpec-only** -- each read calls `ctx.executeBoundSpec(spec, ctx.tabId)`
  exactly once; the origin-pin lives inside executeBoundSpec (RECIPE_ORIGIN_MISMATCH before
  any executeScript).
- **READ-only** -- every spec is a GET; GitLab mutating ops (create/update/merge) need the
  CSRF dance and are Phase 41. No CSRF token is read here.
- **Logged-out guard** -- a 200 carrying a sign-in HTML page is rejected by a per-op shape
  check (array for list_*, id-bearing object for get_*) returning the dual-field
  RECIPE_DOM_FALLBACK_PENDING (reason `gitlab-logged-out-or-rot`, fellBackToDom:true). A
  logged-out body NEVER masquerades as success.
- **No token logged** -- no console call names a token/cookie/csrf variable.

## Wave-2 gate (all GREEN for 40-02)

- node tests/capability-head-handlers.test.js -- gitlab section PASS (slack/notion scaffolds
  still RED until 40-03/04; expected cross-plan).
- node tests/head-handler-upgrade.test.js -- the 5 gitlab rows PASS byte-exact.
- node tests/head-handler-cap.test.js -- EXIT 0 (4 modules, CAP 30 -- closes the 40-01 RED).
- node tests/capability-router.test.js -- EXIT 0 (tier dispatch + origin-pin + INV-02).
- npm run validate:extension -- EXIT 0 (all 6 sub-gates; 4 bundled-head handlers allowlisted).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed forbidden literal strings from gitlab.js comments**
- **Found during:** Task 1
- **Issue:** My docstring/comments contained the literal strings `api.gitlab.com` and
  `chrome.scripting/chrome.tabs` (while EXPLAINING they are forbidden). The head-handlers
  source-scan does a literal `indexOf('api.gitlab.com') === -1` and `!/chrome\.(scripting|
  tabs)/.test(src)`, so the explanatory prose itself failed the scan.
- **Fix:** Rewrote the comments to describe the forbidden host/APIs WITHOUT writing the
  literal strings (the github.js precedent: "a separate public api-host subdomain",
  "browser-extension scripting/tabs APIs").
- **Files modified:** catalog/handlers/gitlab.js
- **Commit:** 9e8cad5a

**2. [Rule 3 - Blocking] Added gitlab.js to the recipe-path-guard allowlist (Wall-1)**
- **Found during:** Task 3 (validate:extension)
- **Issue:** `verify-recipe-path-guard.mjs` enumerates `catalog/handlers/*.js` FROM DISK and
  fails CLOSED on any handler absent from `RECIPE_PATH_ALLOWLIST` (bypass-by-omission: a
  credential-bearing handler the Wall-1 guard does not eval-scan). The new gitlab.js RED'd
  the path-guard.
- **Fix:** Added `'catalog/handlers/gitlab.js'` to the allowlist so Check 1 greps it for
  eval/new Function/import() (gitlab.js is eval-free). validate:extension then EXIT 0.
- **Files modified:** scripts/verify-recipe-path-guard.mjs
- **Commit:** 54c5ea2d

## Out-of-scope (deferred)

- `showcase/angular/public/{sitemap.xml,llms-full.txt}` date bumps from
  `package-extension.mjs` -- left UNSTAGED (see deferred-items.md).

## Self-Check: PASSED

- Files: catalog/handlers/gitlab.js, extension/catalog/handlers/gitlab.js,
  extension/utils/capability-catalog.js, extension/background.js,
  scripts/verify-recipe-path-guard.mjs -- all FOUND.
- Commits: 9e8cad5a, 0f47d417, 54c5ea2d -- all FOUND.
