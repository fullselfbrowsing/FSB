---
status: complete
completed: 2026-07-01T05:53:42Z
quick_id: 260630-vns
slug: make-this-app-booking-t1-ready
commit: working-tree
---

# Summary

Made Booking.com T1-ready for the six safe public search/property rows: `booking.search_properties`, `booking.search_destinations`, `booking.get_property`, `booking.get_property_reviews`, `booking.navigate_to_search`, and `booking.navigate_to_property`.

The new handler is pinned to `https://www.booking.com`, uses only `executeBoundSpec`, performs same-origin HTML GETs, parses public Apollo cache data from returned HTML, returns public navigation URLs without changing the active page, and fails closed with the shared `RECIPE_DOM_FALLBACK_PENDING` fallback when the runtime primitive or HTML shape is unavailable.

Account and private/user-state rows remain unpromoted: `booking.get_current_user`, `booking.get_genius_status`, `booking.list_trips`, and `booking.list_wishlists`.

## Files Changed

- Added `catalog/handlers/booking.js`.
- Added `extension/catalog/handlers/booking.js`.
- Registered Booking in service-worker startup, head seeding, readiness reporting, coverage, recipe-path guard, T1 port verification, origin classification, and search readiness override surfaces.
- Added Booking coverage to handler, head-upgrade, head-cap, readiness, terminal-state, and origin-classification tests.
- Regenerated `extension/catalog/recipe-index.generated.js` and `dist/fsb-extension-v0.9.90.zip` through the extension packaging script.

## Verification

Passed:

- `node -c catalog/handlers/booking.js`
- `node -c extension/catalog/handlers/booking.js`
- `cmp catalog/handlers/booking.js extension/catalog/handlers/booking.js`
- `node tests/head-handler-cap.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `npm run package:extension`

Partial broader checks:

- `node tests/capability-head-handlers.test.js` passes every Booking assertion and the extension copy parity assertion, but the suite still fails one non-Booking assertion: `facebook.search_marketplace parses Marketplace SSR listing fields`.
- `node tests/t1-terminal-states.test.js` passes the Booking terminal-state override assertion, but the suite still fails on duplicate Coinbase guarded-write ledger records.
