---
status: complete
quick_id: 260630-kg0
slug: promote-npm-public-same-origin-read-hand
created: 2026-06-30
completed_at: 2026-06-30T19:51:57Z
---

# Promote npm public same-origin read handlers to T1 ready

## Scope

Promote the public npm same-origin `x-spiferack` read rows that do not require localStorage, page globals, token listing, or private settings discovery.

## Tasks

1. Add a GET-only `npm.js` bundled head handler using `https://www.npmjs.com` and `ctx.executeBoundSpec`.
2. Wire the handler into service-worker imports, catalog head-handler seeding, readiness loading, search readiness overrides, and T1 port contract mapping.
3. Extend head-handler and upgrade tests for the npm rows.
4. Regenerate Phase 44/51 readiness artifacts and record verification.
