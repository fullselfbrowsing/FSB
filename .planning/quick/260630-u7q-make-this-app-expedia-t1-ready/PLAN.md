---
status: complete
created: 2026-07-01T02:55:14Z
quick_id: 260630-u7q
slug: make-this-app-expedia-t1-ready
---

# Make this app Expedia T1-ready

## Scope

Promote the safe public Expedia search/navigation descriptors from DOM fallback to T1 handler-backed readiness while leaving account, trip, and unresolved hotel/location discovery flows unpromoted.

## Plan

1. Add `catalog/handlers/expedia.js` with same-origin HTML GET URL-builder heads for safe public Expedia pages.
2. Mirror the handler into `extension/catalog/handlers/expedia.js` for the packaged extension tree.
3. Register Expedia in service-worker startup, head seeding, readiness loading, coverage, recipe-path guard, port verification, and origin classification.
4. Mark only the promoted Expedia slugs as T1-ready in search readiness overrides.
5. Add focused handler, readiness, head-upgrade, cap, and origin-classification assertions, then run the relevant T1 checks.
