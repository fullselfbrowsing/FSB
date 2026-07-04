---
status: complete
quick_id: 260630-m4c
date: 2026-06-30
---

# Quick Task 260630-m4c: Promote bsky public AppView reads to T1-ready

## Result

Bluesky now has a bundled `bsky.js` T1a handler registered in both catalog copies and loaded by the extension service worker.

The promotion is intentionally narrow:
- 12 public `app.bsky.*` read descriptors are `t1-ready` through no-auth public AppView GET specs at `https://api.bsky.app/xrpc/...`.
- Runtime execution remains pinned to the active `https://bsky.app` tab origin and uses `authStrategy: "none"`.
- Private account, notification, timeline, chat, write, and destructive rows remain catalog-tail `discovery-pending`.

## Readiness

Regenerated `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json` and `.md`.

Bluesky totals:
- descriptors: 38
- ready: 12
- guarded: 0
- discovery pending: 26
- blocked: 0

Global report:
- descriptors: 2314
- apps: 128
- ready: 277
- guarded: 33
- learn pending: 0
- discovery pending: 1810
- blocked: 194

## Verification

- `node tests/capability-head-handlers.test.js` PASS
- `node tests/capability-fetch.test.js` PASS
- `node tests/head-handler-upgrade.test.js` PASS
- `node tests/verify-origin-classification.test.js` PASS
- `node tests/service-denylist.test.js` PASS
- `node tests/head-handler-cap.test.js` PASS
- `node tests/lattice-provider-bridge-smoke.test.js` PASS
- `node scripts/verify-origin-classification.mjs` PASS
- `node scripts/verify-recipe-path-guard.mjs` PASS
- `node scripts/verify-t1-readiness-gate.mjs` PASS
- `node scripts/verify-t1-port-contract.mjs` PASS
- `node scripts/coverage-report.mjs` PASS
- `node scripts/report-t1-readiness.mjs` PASS

## Notes

`api.bsky.app` is an explicit Bluesky-only public no-auth CORS read accommodation in the origin classifier. The gate source-proves it against the vendored Bluesky `app.bsky.*` GET tools and rejects malformed public AppView overrides. The fetch primitive now honors `authStrategy: "none"` with `credentials: "omit"` so wildcard public CORS AppView responses are not rejected as credentialed requests. Handler tests guard against direct `fetch`, tab scripting, session storage reads, auth headers, chat/proxy endpoints, and secret logging.
