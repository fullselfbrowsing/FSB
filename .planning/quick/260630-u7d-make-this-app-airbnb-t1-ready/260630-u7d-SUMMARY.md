# Quick 260630-u7d Summary: Make Airbnb T1-Ready

## Status
Complete in working tree.

## Implemented
- Added bundled Airbnb T1a handler coverage in `catalog/handlers/airbnb.js` and regenerated the extension copy.
- Promoted 13 read-only Airbnb slugs:
  - `airbnb.get_current_user`
  - `airbnb.get_header_info`
  - `airbnb.get_inbox_filters`
  - `airbnb.get_listing_from_page`
  - `airbnb.get_map_viewport_info`
  - `airbnb.get_message_thread`
  - `airbnb.get_search_results`
  - `airbnb.get_user_thumbnail`
  - `airbnb.get_wishlist_items`
  - `airbnb.is_host`
  - `airbnb.list_message_threads`
  - `airbnb.list_wishlists`
  - `airbnb.search_suggestions`
- Kept destructive `airbnb.remove_from_wishlist` excluded from handler and T1 readiness.
- Added Airbnb same-origin GraphQL reads plus bounded page-read extraction for current-page search/listing state.
- Wired Airbnb through handler imports, capability catalog/search, T1 readiness, port-contract, origin classification, path guard, and coverage-report surfaces.
- Corrected `airbnb.is_host` side-effect classification to source-audited `read`.

## Verification
- `node -c catalog/handlers/airbnb.js`
- `node -c extension/catalog/handlers/airbnb.js`
- `node -c extension/utils/capability-fetch.js`
- `node -c extension/utils/capability-search.js`
- `node -c tests/capability-head-handlers.test.js`
- `node scripts/package-extension.mjs`
- `cmp -s catalog/handlers/airbnb.js extension/catalog/handlers/airbnb.js`
- `node tests/head-handler-cap.test.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/verify-origin-classification.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/verify-catalog-crosscheck.mjs`
- `node tests/catalog-inline-shape.test.js`
- `node tests/breadth-search-return.test.js`

## Notes
- Regenerated `extension/catalog/recipe-index.generated.js`, handler copies, and `dist/fsb-extension-v0.9.90.zip` via packaging.
- Live Airbnb browser smoke was not run; it requires an attached extension/browser session and live Airbnb auth state.
- No commit was created because the workspace had substantial pre-existing unrelated dirty state.
