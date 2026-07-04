---
quick_id: 260630-vog
slug: make-this-app-pandaexpress-t1-ready
status: complete
created: 2026-07-01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - QT-260630-vog
user_setup: []
files_modified:
  - catalog/handlers/pandaexpress.js
  - extension/catalog/handlers/pandaexpress.js
  - extension/background.js
  - extension/utils/capability-catalog.js
  - extension/utils/capability-search.js
  - scripts/report-t1-readiness.mjs
  - scripts/coverage-report.mjs
  - scripts/verify-t1-port-contract.mjs
  - scripts/verify-origin-classification.mjs
  - scripts/verify-recipe-path-guard.mjs
  - tests/capability-head-handlers.test.js
  - tests/head-handler-upgrade.test.js
  - tests/head-handler-cap.test.js
  - tests/verify-origin-classification.test.js
  - tests/t1-readiness-report.test.js
  - tests/t1-terminal-states.test.js
  - .planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json
  - .planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.json
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.md
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.json
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.md
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-WRITE-UAT-LEDGER.json
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-WRITE-UAT-LEDGER.md
  - .planning/STATE.md
  - .planning/quick/260630-vog-make-this-app-pandaexpress-t1-ready/260630-vog-SUMMARY.md
must_haves:
  truths:
    - "Panda Express public location, restaurant, menu, and product-modifier reads resolve as T1a handler-backed capabilities."
    - "Panda Express auth-token, customer, payment, rewards, favorites, basket, checkout, coupon, order-history, and mutation rows do not become active."
    - "The Panda Express handler uses executeBoundSpec only against same-origin https://www.pandaexpress.com Olo/NomNom GET reads."
    - "Origin classification proves this as an app-specific same-origin Olo/NomNom read head, not a generic relative-runtime bypass."
    - "Search/readiness surfaces mark only the promoted Panda Express slugs as T1-ready."
  artifacts:
    - path: "catalog/handlers/pandaexpress.js"
      provides: "Canonical Panda Express T1a public read handler"
      contains: "FsbHandlerPandaexpress"
    - path: "extension/catalog/handlers/pandaexpress.js"
      provides: "Extension copy of the Panda Express handler"
      contains: "FsbHandlerPandaexpress"
    - path: "scripts/verify-origin-classification.mjs"
      provides: "Panda Express same-origin Olo/NomNom origin proof"
      contains: "readPandaExpressRelativeRuntimeBase"
    - path: "extension/utils/capability-search.js"
      provides: "Search readiness override for promoted Panda Express rows"
      contains: "pandaexpress.find_restaurants"
  key_links:
    - from: "extension/background.js"
      to: "extension/catalog/handlers/pandaexpress.js"
      via: "importScripts('catalog/handlers/pandaexpress.js')"
      pattern: "catalog/handlers/pandaexpress\\.js"
    - from: "catalog/handlers/pandaexpress.js"
      to: "extension/utils/capability-catalog.js"
      via: "FsbCapabilityCatalog.registerHandler for each promoted pandaexpress.* slug"
      pattern: "registerHandler\\('pandaexpress\\."
    - from: "scripts/report-t1-readiness.mjs"
      to: "extension/catalog/handlers/pandaexpress.js"
      via: "HANDLER_MODULES includes pandaexpress.js"
      pattern: "'pandaexpress\\.js'"
---

# Quick Task 260630-vog: Make Panda Express T1-ready

## Goal

Promote Panda Express' safe public same-origin Olo/NomNom read subset from DOM/discovery tail to verified T1a handler coverage.

This task must not activate the authenticated Panda Express runtime. The vendored helper reads `persist:root` localStorage for an auth token and uses that token in `/users/{authtoken}/...` paths for account, payment, rewards, favorites, and recent-order data. Those flows stay out of scope.

## Source Audit

- GOAL: "Make this app pandaexpress T1-ready" is covered by adding handler-backed T1a coverage for the safe public read subset and refreshing readiness/search surfaces.
- STATE invariants: keep the two-tool capability surface, MV3 Wall 1, Wall 2 origin pin, sensitive-origin behavior, and fail-closed write posture. Do not add per-app MCP tools, OpenTabs runtime code, direct fetches, or a generic cross-origin bridge.
- Existing pattern: follow the current Chipotle/Costco/Target quick-task shape: dual IIFE/CommonJS handler, extension-copy parity, `executeBoundSpec` only, app-specific origin proof, readiness overrides, and focused negative controls.
- Dirty-tree safety: if Panda Express handler stubs or copied extension files already exist, read and update them in place; do not overwrite unrelated user work.
- Panda Express source facts: `panda-api.ts` uses relative Olo/NomNom endpoints under the page origin, but also includes localStorage auth-token helpers. This plan promotes only reviewed no-token GET endpoints.

## T1-ready slugs

- `pandaexpress.find_restaurants`
- `pandaexpress.get_restaurant`
- `pandaexpress.get_restaurant_menu`
- `pandaexpress.get_product_modifiers`

## Excluded rows

Do not register these rows as active handlers: `pandaexpress.add_product_to_basket`, `pandaexpress.apply_coupon`, `pandaexpress.cancel_order`, `pandaexpress.create_basket`, `pandaexpress.get_basket`, `pandaexpress.get_billing_accounts`, `pandaexpress.get_checkout_summary`, `pandaexpress.get_favorites`, `pandaexpress.get_loyalty_rewards`, `pandaexpress.get_recent_orders`, `pandaexpress.get_user_profile`, `pandaexpress.navigate_to_checkout`, `pandaexpress.remove_coupon`, and `pandaexpress.update_product_quantity`.

These excluded rows touch basket/order state, coupons, checkout navigation, auth-token paths, localStorage profile/rewards state, payment methods, recent orders, or write/destructive HTTP methods. They must stay non-ready unless an existing repo policy requires inert guarded fail-closed registration; if guarded, handlers must return dual-field `RECIPE_DOM_FALLBACK_PENDING` and must not call `executeBoundSpec`.

## Safety Constraints

- Use `ctx.executeBoundSpec` only. No direct `fetch`, `XMLHttpRequest`, `chrome.scripting`, `chrome.tabs`, `chrome.cookies`, `chrome.webRequest`, or OpenTabs runtime/plugin code.
- Use same-origin `https://www.pandaexpress.com` Olo/NomNom reads only. Do not add a public CORS or separate-host accommodation.
- Use no customer/session credentials: `authStrategy: "none"`, `credentials: "omit"`, no `Authorization`, no `Bearer`, no `authtoken`, no `getRequiredAuthToken`, no `getLocalStorage`, no `localStorage`, no `sessionStorage`, no `persist:root`, no `document.cookie`, no CSRF/cookie scraping.
- Do not activate customer, payment, rewards, favorites, basket, checkout, coupon, recent-order, order-history, or mutation flows.
- Writes/destructive rows must fail closed or remain non-ready according to the existing readiness policy; none may become active without separate mutation-body UAT and consent/audit evidence.

## Tasks

### 1. Add the Panda Express public Olo/NomNom read handler

Files:
- `catalog/handlers/pandaexpress.js`
- `extension/catalog/handlers/pandaexpress.js`
- `tests/capability-head-handlers.test.js`

Action:
- Create or update a dual IIFE/CommonJS handler module exporting `FsbHandlerPandaexpress`.
- Use `PANDA_ORIGIN = "https://www.pandaexpress.com"` and `PANDA_SERVICE = "pandaexpress.com"`.
- Register only the four T1-ready slugs listed above as `tier: "T1a"`, `origin: PANDA_ORIGIN`, `sideEffectClass: "read"`, with params copied from the existing descriptor JSON.
- Build GET specs through `ctx.executeBoundSpec` with absolute same-origin URLs:
  - `find_restaurants`: `https://www.pandaexpress.com/restaurants/near?lat={latitude}&long={longitude}&radius={radius || 10}&limit={limit || 10}`
  - `get_restaurant`: `https://www.pandaexpress.com/restaurants/byslug/{slug}` or `https://www.pandaexpress.com/restaurants/byref/{ext_ref}`
  - `get_restaurant_menu`: `https://www.pandaexpress.com/restaurants/{restaurant_id}/menu`
  - `get_product_modifiers`: `https://www.pandaexpress.com/products/{product_id}/modifiers`
- Use `authStrategy: "none"`, `credentials: "omit"`, `origin: PANDA_ORIGIN`, `extract: "@"`, `Accept: "application/json"`, and no body.
- Validate input before execution: finite latitude/longitude, bounded radius/limit, positive integer restaurant/product IDs, and exactly one of `slug` or `ext_ref` for `get_restaurant`. Invalid input returns fallback without calling `executeBoundSpec`.
- Map restaurant, menu category/product, and modifier group outputs using the intent in `vendor/opentabs-snapshot/plugins/panda-express/src/tools/schemas.ts`.
- Return dual-field `RECIPE_DOM_FALLBACK_PENDING` with `fellBackToDom: true` on missing `ctx.executeBoundSpec`, redirects, 401/403, HTTP errors, non-object/non-array shapes, service error payloads, or missing required fields.
- Copy `catalog/handlers/pandaexpress.js` byte-for-byte to `extension/catalog/handlers/pandaexpress.js`.
- Extend `tests/capability-head-handlers.test.js` with Panda Express assertions: four exported read slugs, excluded rows absent or inert guarded only, specs use `https://www.pandaexpress.com`, `authStrategy: none`, `credentials: omit`, mapped outputs, invalid-input fallback with no execution, HTTP/shape fallback, banned-token/source checks, and extension-copy parity.

Verify:
- `node --check catalog/handlers/pandaexpress.js`
- `node --check extension/catalog/handlers/pandaexpress.js`
- `cmp catalog/handlers/pandaexpress.js extension/catalog/handlers/pandaexpress.js`
- `node tests/capability-head-handlers.test.js`

Done:
- `FsbHandlerPandaexpress` exists in both handler roots, exports exactly the reviewed public read subset, and cannot access auth, customer, payment, rewards, basket, checkout, or order-history state.

### 2. Wire Panda Express through runtime, readiness, and gates

Files:
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-origin-classification.mjs`
- `tests/head-handler-upgrade.test.js`
- `tests/head-handler-cap.test.js`
- `tests/verify-origin-classification.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`

Action:
- Add `importScripts('catalog/handlers/pandaexpress.js')` after the existing handler imports in `extension/background.js`.
- Add `{ global: 'FsbHandlerPandaexpress', service: 'pandaexpress.com', origin: 'https://www.pandaexpress.com' }` to `HEAD_HANDLER_MODULES` without removing current handlers. The current manifest has 55 entries; after this task `tests/head-handler-cap.test.js` should expect 56 and set `CAP = 56`.
- Add `pandaexpress.js` to handler module lists in readiness reporting, coverage reporting, T1 port contract verification, and recipe-path allowlisting.
- Add `pandaexpress: 'pandaexpress.js'` to `HANDLER_BY_APP` in `scripts/verify-t1-port-contract.mjs`.
- Add the four promoted slugs to `T1_READY_SLUGS` in `extension/utils/capability-search.js`. Do not add excluded Panda Express rows.
- In `scripts/verify-origin-classification.mjs`, add `FsbHandlerPandaexpress` to `HEAD_APP_MAP` with `app: 'panda-express'`, `fallbackBaseUrl: 'https://www.pandaexpress.com'`, and `relativeRuntimeBaseUrl: '/'`.
- Implement `readPandaExpressRelativeRuntimeBase(app, relativeRuntimeBaseUrl)` and include it in the existing relative-runtime proof chain. It must return `/` only when all of these are true:
  - app is `panda-express` and requested relative base is exactly `/`
  - `panda-api.ts` uses relative endpoint strings and does not define a separate API host for the promoted reads
  - selected tool files contain `/restaurants/near`, `/restaurants/byslug/`, `/restaurants/byref/`, `/restaurants/${params.restaurant_id}/menu`, and `/products/${params.product_id}/modifiers`
  - `catalog/handlers/pandaexpress.js` contains `Panda Express same-origin Olo/NomNom READ head`, `PANDA_ORIGIN`, `authStrategy: 'none'`, `credentials: 'omit'`, all four promoted slugs, and none of the excluded slugs as active registrations
  - handler source contains no direct fetch/XHR, extension credential APIs, `Authorization`, `Bearer`, `authtoken`, `getRequiredAuthToken`, `getLocalStorage`, `localStorage`, `sessionStorage`, `persist:root`, `document.cookie`, `csrfSource`, `/users/`, `/baskets/`, `/orders/`, `billingaccounts`, `recentorders`, `faves`, `loyalty`, `window.location`, or `__opentabs_pending_basket`
- Route the proof through normal strict same-origin classification by returning `fallbackOrigin + "/"`; do not set `publicCorsRead` or loosen generic same-origin behavior.
- Extend `tests/head-handler-upgrade.test.js` with the four Panda Express slugs and origin `https://www.pandaexpress.com`.
- Extend `tests/verify-origin-classification.test.js` with Panda Express positive assertions and negative controls proving auth-token/localStorage, `/users/`, basket/order paths, checkout navigation, or an excluded row fails the origin proof.
- Extend readiness and terminal-state tests so the four promoted rows are handler-backed T1-ready and every excluded Panda Express row remains non-ready or inert guarded fail-closed according to existing policy.

Verify:
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`

Done:
- Panda Express is registered as a head handler, the same-origin Olo/NomNom proof is app-specific and non-generic, and all runtime/search/readiness gates recognize only the promoted public read subset.

### 3. Refresh generated readiness artifacts and record the quick task

Files:
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.json`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.md`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.json`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.md`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-WRITE-UAT-LEDGER.json`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-WRITE-UAT-LEDGER.md`
- `.planning/STATE.md`
- `.planning/quick/260630-vog-make-this-app-pandaexpress-t1-ready/260630-vog-SUMMARY.md`

Action:
- Regenerate T1 readiness, tail worklist, terminal-state, and write-UAT ledger artifacts after the handler/gate changes.
- Confirm readiness rows:
  - the four promoted Panda Express slugs are `t1-ready`, `T1a`, proof `handler`, runtime origin `https://www.pandaexpress.com`, and route feasibility strict same-origin or equivalent same-origin Olo/NomNom status
  - all excluded Panda Express rows remain non-ready/non-handler-proof unless existing policy marks a write as inert guarded fail-closed
  - no customer/payment/rewards/order-history/basket/checkout row is active
- Run `npm run package:extension` only after focused tests pass, so the extension package includes `extension/catalog/handlers/pandaexpress.js`.
- Write `260630-vog-SUMMARY.md` with promoted slugs, excluded slugs, verification results, safety constraints upheld, and any unrelated dirty-worktree failures.
- Add a Quick Tasks Completed row to `.planning/STATE.md` for "Make this app Panda Express T1-ready".

Verify:
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-tail-worklist.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `npm run package:extension`
- `npm run validate:extension`

Done:
- Readiness/search surfaces show the promoted Panda Express same-origin read subset as T1-ready, excluded rows stay honest, generated artifacts are refreshed, and quick-task bookkeeping is complete.

## Success Criteria

- `search_capabilities` can surface the four promoted Panda Express public read rows as handler-backed T1-ready capabilities.
- `invoke_capability` routes those four rows through `FsbHandlerPandaexpress` and `executeBoundSpec` with credential-free same-origin Olo/NomNom GET specs.
- No Panda Express localStorage, auth token, customer, payment, rewards, basket, checkout, recent-order, order-history, coupon, write, or destructive row becomes active.
- Origin-classification, recipe-path, T1 port contract, head-upgrade, head-cap, readiness, terminal-state, package, and extension validation gates pass for Panda Express.
