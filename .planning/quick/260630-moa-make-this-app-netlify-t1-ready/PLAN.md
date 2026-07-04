---
quick_id: 260630-moa
slug: make-this-app-netlify-t1-ready
status: completed
---

# Make This App Netlify T1-ready

## Scope

Promote the Netlify catalog stem from partial T1 coverage to complete current T1 accounting:

- Read-only Netlify descriptors resolve to same-origin T1 execution pinned to `https://app.netlify.com`.
- Netlify write/destructive descriptors are explicit guarded fail-closed rows until live mutation-body UAT exists.
- Search readiness, T1 readiness reporting, write evidence, and focused upgrade/fail-closed gates recognize the full Netlify surface.

## Implementation

1. Expand `catalog/handlers/netlify.js` to register the Netlify handler-owned descriptors:
   - 20 read handlers using first-party `/access-control/bb-api/api/v1` GET specs.
   - 19 write/destructive guarded handlers that return `RECIPE_DOM_FALLBACK_PENDING` without calling `executeBoundSpec`.
   - `netlify.get_current_user` stays on the existing generated T1b same-origin recipe path.
2. Sync `extension/catalog/handlers/netlify.js` byte-for-byte with the source handler.
3. Update readiness/search status lists, T1 report guarded rows, focused tests, and write activation evidence for Netlify.
4. Regenerate the Phase 44 readiness report.

## Verification

Expected focused gates:

- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node tests/backing-status-annotation.test.js`

Expected broader gates may still surface unrelated workspace drift from in-progress Instagram/Pinterest work. See `SUMMARY.md`.
