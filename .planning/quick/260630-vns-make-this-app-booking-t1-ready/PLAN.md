---
status: complete
created: 2026-07-01T05:53:42Z
quick_id: 260630-vns
slug: make-this-app-booking-t1-ready
---

# Make this app Booking T1-ready

## Scope

Promote only the safe public Booking.com search/property descriptors from DOM fallback to T1 handler-backed readiness while leaving account, Genius, trips, and wishlist flows unpromoted.

## Plan

1. Add `catalog/handlers/booking.js` with same-origin HTML GET handlers for public Booking search and property pages.
2. Mirror the handler into `extension/catalog/handlers/booking.js` for the packaged extension tree.
3. Register Booking in service-worker startup, head seeding, readiness loading, coverage, recipe-path guard, port verification, and origin classification.
4. Mark only the promoted Booking slugs as T1-ready in search readiness overrides.
5. Add focused handler, readiness, head-upgrade, cap, terminal-state, and origin-classification assertions, then run the relevant T1 checks.
