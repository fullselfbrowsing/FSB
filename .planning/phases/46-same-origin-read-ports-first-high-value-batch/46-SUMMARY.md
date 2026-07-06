# Phase 46 Summary: Same-Origin Read Ports - First High-Value Batch

Phase 46 is complete.

## Shipped

- Added three read-only T1a handler modules:
  - `catalog/handlers/netlify.js`
  - `catalog/handlers/bitbucket.js`
  - `catalog/handlers/circleci.js`
- Mirrored the handlers into the hot extension tree under `extension/catalog/handlers/`.
- Registered three new head globals in `HEAD_HANDLER_MODULES`.
- Imported the new handlers from the service worker.
- Marked the 10 selected read slugs as `t1-ready` in search readiness.
- Extended readiness, origin-classification, recipe-path, and T1 port contract gates.

## Activated Read Slugs

- `netlify.list_sites`
- `netlify.get_site`
- `netlify.list_deploys`
- `netlify.list_forms`
- `bitbucket.list_workspaces`
- `bitbucket.list_repositories`
- `bitbucket.get_repository`
- `circleci.get_current_user`
- `circleci.list_pipelines`
- `circleci.get_project`

## Verification

Focused tests and `npm run validate:extension` passed. The readiness gate now reports 31 ready descriptors and 5 guarded fail-closed descriptors.

## Deferred

Live credential UAT for Netlify, Bitbucket, and CircleCI remains deferred in `46-HUMAN-UAT.md`. Apps needing page-token/CSRF/separate-origin work are deferred to later milestone phases.
