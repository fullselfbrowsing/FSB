---
quick_id: 260630-vnj
description: Make this app Facebook T1-ready
status: planned
date: 2026-06-30
mode: quick
---

# Quick Task 260630-vnj: Make Facebook T1-ready

## Objective

Promote the safe Facebook surface to a conservative T1a head while keeping sensitive Facebook social mutations fail-closed. Scope is Facebook-only.

T1-ready read rows:

- `facebook.get_current_user` - same-origin page HTML read of `CurrentUserInitialData` only; no token collection or return.
- `facebook.search_marketplace` - public/same-origin Marketplace search page HTML read.

Guarded fail-closed rows:

- `facebook.confirm_friend_request`
- `facebook.delete_friend_request`
- `facebook.react_to_post`

Catalog-tail reads that must remain discovery-pending in this task:

- `facebook.get_user_profile`
- `facebook.get_user_posts`
- `facebook.get_reactions`
- `facebook.list_events`
- `facebook.list_friend_requests`
- `facebook.list_groups`
- `facebook.list_notifications`
- `facebook.list_saved`
- `facebook.search`

Reason: the vendored source for those rows uses authenticated Relay GraphQL, dynamic doc IDs, CSRF carriers, or private viewer data. Do not label them T1-ready without a reviewed public/same-origin request shape.

## Context Read

- `.planning/STATE.md`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `catalog/descriptors/opentabs__facebook__*.json`
- `catalog/handlers/instagram.js`
- `catalog/handlers/x.js`
- `catalog/handlers/reddit.js`
- `tests/head-handler-cap.test.js`
- `tests/capability-head-handlers.test.js`
- `scripts/verify-origin-classification.mjs`
- `tests/verify-origin-classification.test.js`

## Source Audit

- STATE invariants covered: two-tool capability surface, MV3 Wall 1, same-origin Wall 2, sensitive-origin handling, and fail-closed writes stay intact.
- Facebook descriptors covered: 2 read rows promoted, 3 mutation rows guarded, 9 private Relay reads left as discovery-pending.
- Handler analogs followed: X public HTML parsing, Instagram guarded social mutations, Reddit same-origin `executeBoundSpec` discipline.

## Tasks

### 1. Add the Facebook conservative head handler

Files:

- `catalog/handlers/facebook.js`
- `extension/catalog/handlers/facebook.js`

Action:

- Create an IIFE/CommonJS-compatible handler module exporting `FsbHandlerFacebook`.
- Use `ORIGIN = "https://www.facebook.com"` and `SERVICE = "facebook.com"`.
- Register `facebook.get_current_user` as `tier: "T1a"`, `sideEffectClass: "read"`, with closed empty params. It must issue a same-origin GET spec to `https://www.facebook.com/`, parse only the logged-in user's id/name/short name from inert HTML data such as `CurrentUserInitialData`, and return `RECIPE_DOM_FALLBACK_PENDING` when the shape is absent.
- Register `facebook.search_marketplace` as `tier: "T1a"`, `sideEffectClass: "read"`, with the existing descriptor params. It must issue a same-origin GET spec to `/marketplace/search/?query=...`, parse Marketplace SSR/preloader JSON into listing fields, and return the search URL plus parsed listings.
- Register the 3 guarded rows above as `tier: "T1a"` entries whose `handle()` returns INV-03-compatible `RECIPE_DOM_FALLBACK_PENDING` without calling `ctx.executeBoundSpec` or `ctx.executeBoundPageRead`.
- Do not implement `/api/graphql/`, `/ajax/typeahead/search/facebar/query/`, Relay doc IDs, `fb_dtsg`, `lsd`, cookies, local/session storage, bearer auth, direct `fetch`, `XMLHttpRequest`, `chrome.tabs`, or `chrome.scripting`.
- Copy the handler byte-for-byte to `extension/catalog/handlers/facebook.js`.

Verify:

- `node -e "const h=require('./catalog/handlers/facebook.js'); const ready=['facebook.get_current_user','facebook.search_marketplace']; const guarded=['facebook.confirm_friend_request','facebook.delete_friend_request','facebook.react_to_post']; for (const s of ready) if (!h[s] || h[s].tier !== 'T1a' || h[s].sideEffectClass !== 'read' || h[s].origin !== 'https://www.facebook.com') throw new Error('bad ready '+s); for (const s of guarded) if (!h[s] || h[s].tier !== 'T1a' || h[s].origin !== 'https://www.facebook.com' || typeof h[s].handle !== 'function') throw new Error('bad guarded '+s); console.log('PASS facebook handler surface');"`
- `cmp catalog/handlers/facebook.js extension/catalog/handlers/facebook.js`

Done:

- Facebook has a mirrored bundled handler pair with 2 executable read rows and 3 inert guarded rows, all pinned to `https://www.facebook.com`.

### 2. Wire Facebook into registration, readiness, search, and origin gates

Files:

- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `catalog/write-activation-evidence.json`

Action:

- Add `extension/catalog/handlers/facebook.js` to the service-worker import list near the other catalog head handlers.
- Add `{ global: "FsbHandlerFacebook", service: "facebook.com", origin: "https://www.facebook.com" }` to `HEAD_HANDLER_MODULES`.
- Add `FsbHandlerFacebook` to `scripts/verify-origin-classification.mjs` with app `facebook`, fallback origin `https://www.facebook.com`, `relativeRuntimeBaseUrl: "/"`, and `ignoreVendoredBaseUrl: true`.
- Add a Facebook-specific relative-runtime proof in `verify-origin-classification.mjs` that accepts only the reviewed conservative handler shape: `facebook.js` exists, source declares the Facebook conservative same-origin read head, uses GET-only bound specs, includes `facebook.search_marketplace`, excludes `/api/graphql/`, `fb_dtsg`, `lsd`, `doc_id`, and excludes direct credential/browser APIs.
- Add the Facebook handler to recipe-path, T1 port-contract, coverage, and readiness reporting lists.
- In `extension/utils/capability-search.js`, add `facebook.get_current_user` and `facebook.search_marketplace` to `T1_READY_SLUGS`; add the 3 guarded rows to `T1_GUARDED_FAIL_CLOSED_SLUGS`.
- In `scripts/report-t1-readiness.mjs` and `catalog/write-activation-evidence.json`, mark the 3 guarded rows as guarded fail-closed with specific reasons and required evidence fields for any activation: method, path, bodyShape, csrfLocation, auditRedactionProof, loadedExtensionSmoke.
- Do not add the 9 catalog-tail read rows to `T1_READY_SLUGS`.

Verify:

- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/report-t1-readiness.mjs`
- `node scripts/verify-t1-readiness-gate.mjs`

Done:

- Resolver, service-worker imports, search/readiness labels, origin classification, path guard, and write-evidence gates all recognize Facebook's ready/guarded split.

### 3. Add focused Facebook regression coverage

Files:

- `tests/capability-head-handlers.test.js`
- `tests/head-handler-cap.test.js`
- `tests/verify-origin-classification.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-terminal-states.test.js`

Action:

- Extend `tests/capability-head-handlers.test.js` with Facebook fixtures proving:
  - `facebook.get_current_user` builds one GET spec to `https://www.facebook.com/`, extracts only id/name/short name, and does not expose CSRF or cookie-like values even when fixture HTML contains token-shaped keys.
  - `facebook.search_marketplace` builds one GET spec to `https://www.facebook.com/marketplace/search/?query=...` and maps Marketplace SSR listing data.
  - malformed HTML, redirects, 401/403, non-object data, and missing expected shapes return `RECIPE_DOM_FALLBACK_PENDING`.
  - the 3 guarded rows return `RECIPE_DOM_FALLBACK_PENDING` and never call `executeBoundSpec` or `executeBoundPageRead`.
  - handler source has no direct `fetch`, `XMLHttpRequest`, `chrome.tabs`, `chrome.scripting`, `document.cookie`, local/session storage, bearer auth, `/api/graphql/`, `fb_dtsg`, `lsd`, or `doc_id`.
  - catalog and extension handler copies are byte-identical.
- Update `tests/head-handler-cap.test.js`: add `FsbHandlerFacebook`, update exact head count to 56, and set `CAP` to 56.
- Extend `tests/verify-origin-classification.test.js`: parse `FsbHandlerFacebook === https://www.facebook.com`, assert the real origin gate includes Facebook with 0 failures, and add a negative control proving a Facebook handler that targets `https://graph.facebook.com` or `/api/graphql/` fails the Facebook relative-runtime proof.
- Extend `tests/head-handler-upgrade.test.js` for the 2 ready rows and 3 guarded rows.
- Extend `tests/guarded-write-failclosed.test.js` for the 3 guarded rows.
- Extend `tests/t1-terminal-states.test.js` so the 2 ready rows are `t1-ready`, the 3 guarded rows are `t1-guarded-fail-closed`, and the 9 private Relay reads remain discovery-pending.

Verify:

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-terminal-states.test.js`
- `npm run validate:extension`

Done:

- Focused Facebook tests pass, extension validation passes, and search/readiness surfaces show only the reviewed Facebook rows as ready or guarded.

## Success Criteria

- `search_capabilities` labels `facebook.get_current_user` and `facebook.search_marketplace` as `t1-ready`.
- `search_capabilities` labels `facebook.confirm_friend_request`, `facebook.delete_friend_request`, and `facebook.react_to_post` as `t1-guarded-fail-closed`.
- `invoke_capability` routes ready Facebook reads through the bundled handler and same-origin bound specs.
- Sensitive Facebook friend/reaction mutations never execute a network or page-read primitive.
- Private Relay-only Facebook reads remain catalog-tail entries rather than direct-ready rows.
