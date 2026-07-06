---
quick_id: 260630-qjb
slug: make-this-app-lucid-t1-ready
description: Make this app lucid T1-ready
status: completed
created: 2026-06-30
completed: 2026-07-01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - QT-260630-qjb
user_setup: []
files_modified:
  - catalog/handlers/lucid.js
  - extension/catalog/handlers/lucid.js
  - extension/background.js
  - extension/utils/capability-catalog.js
  - extension/utils/capability-search.js
  - catalog/write-activation-evidence.json
  - scripts/report-t1-readiness.mjs
  - scripts/coverage-report.mjs
  - scripts/verify-t1-port-contract.mjs
  - scripts/verify-origin-classification.mjs
  - scripts/verify-recipe-path-guard.mjs
  - tests/capability-head-handlers.test.js
  - tests/head-handler-upgrade.test.js
  - tests/head-handler-cap.test.js
  - tests/guarded-write-failclosed.test.js
  - tests/t1-readiness-report.test.js
  - tests/t1-terminal-states.test.js
  - tests/verify-origin-classification.test.js
  - tests/write-activation-evidence.test.js
  - tests/lattice-provider-bridge-smoke.test.js
  - .planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json
  - .planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.json
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.md
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.json
  - .planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.md
  - .planning/STATE.md
  - .planning/quick/260630-qjb-make-this-app-lucid-t1-ready/260630-qjb-SUMMARY.md
must_haves:
  truths:
    - "Lucid read descriptors resolve as T1a handler-backed capabilities from a Lucid-owned tab."
    - "Lucid write/destructive descriptors are searchable guarded fail-closed rows and never call ctx.executeBoundSpec."
    - "The Lucid handler uses executeBoundSpec only, with no direct fetch, chrome credential APIs, direct cookie reads, storage reads, bearer replay, or generic Pattern-D bridge."
    - "Origin classification explicitly proves Lucid's first-party same-site API subdomains and fails closed if the handler adds unreviewed bases or mutation execution."
    - "Search/readiness/reporting surfaces mark Lucid reads as t1-ready and Lucid mutations as t1-guarded-fail-closed."
  artifacts:
    - path: "catalog/handlers/lucid.js"
      provides: "Canonical Lucid T1a read and guarded-write handler"
      contains: "FsbHandlerLucid"
    - path: "extension/catalog/handlers/lucid.js"
      provides: "Extension copy of Lucid handler"
      contains: "FsbHandlerLucid"
    - path: "catalog/write-activation-evidence.json"
      provides: "Guarded evidence records for Lucid mutation rows"
      contains: "lucid.create_document"
    - path: "scripts/verify-origin-classification.mjs"
      provides: "Lucid-specific same-site first-party API proof"
      contains: "FsbHandlerLucid"
  key_links:
    - from: "extension/background.js"
      to: "extension/catalog/handlers/lucid.js"
      via: "importScripts('catalog/handlers/lucid.js')"
      pattern: "catalog/handlers/lucid\\.js"
    - from: "catalog/handlers/lucid.js"
      to: "extension/utils/capability-catalog.js"
      via: "FsbCapabilityCatalog.registerHandler for each lucid.* slug"
      pattern: "registerHandler\\('lucid\\."
    - from: "scripts/report-t1-readiness.mjs"
      to: "extension/catalog/handlers/lucid.js"
      via: "HANDLER_MODULES includes lucid.js so readiness resolves handler proof"
      pattern: "'lucid\\.js'"
---

# Quick Task 260630-qjb: Make Lucid T1-ready

## Goal

Promote the Lucid catalog stem from DOM/discovery tail to the current T1 readiness contract:
read-classified Lucid rows execute through a bundled T1a handler, while mutation-capable rows
remain guarded fail-closed until live mutation-body UAT records exact method/path/body/CSRF and
redaction evidence.

## Source Audit

- GOAL: "Make this app lucid T1-ready" is covered by handler-backed T1a coverage for Lucid reads, guarded fail-closed registration for Lucid mutations, and readiness/search/report updates.
- STATE invariants: keep the two-tool capability surface, MV3 Wall 1, Wall 2 origin pin, fail-closed write posture, and no OpenTabs runtime/plugin code in the extension.
- Local source: `catalog/descriptors/opentabs__lucid__*.json` already provides 20 descriptors; no descriptor synthesis is required unless tests reveal the generated extension catalog is stale.
- Local vendored source: `vendor/opentabs-snapshot/plugins/lucid/src/lucid-api.ts` uses `https://users.lucid.app`, `https://documents.lucid.app`, and `https://userdocslist.lucid.app`; this plan requires an explicit Lucid same-site first-party API proof instead of a generic cross-origin accommodation.
- Explicit exclusions: do not activate Lucid writes/destructive actions, do not add a generic same-registrable-domain auth bypass, and do not introduce a Pattern-D bridge.

## T1-ready read slugs

- `lucid.get_account`
- `lucid.get_current_user`
- `lucid.get_document`
- `lucid.get_document_count`
- `lucid.get_document_pages`
- `lucid.get_document_role`
- `lucid.get_document_status`
- `lucid.get_folder_entry`
- `lucid.get_user_permissions`
- `lucid.list_account_users`
- `lucid.list_documents`
- `lucid.list_folder_entries`
- `lucid.list_groups`
- `lucid.search_documents`

## Guarded fail-closed mutation slugs

- `lucid.create_document`
- `lucid.create_folder`
- `lucid.delete_folder`
- `lucid.move_document_to_folder`
- `lucid.rename_folder`
- `lucid.trash_document`

## Tasks

### 1. Add the Lucid handler twins and guarded evidence

Files:
- `catalog/handlers/lucid.js`
- `extension/catalog/handlers/lucid.js`
- `catalog/write-activation-evidence.json`
- `tests/capability-head-handlers.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/write-activation-evidence.test.js`

Action:
- Create a dual IIFE/CommonJS handler module exporting `FsbHandlerLucid`.
- Use `LUCID_ORIGIN = "https://lucid.app"`, `LUCID_SERVICE = "lucid.app"`, `USERS_BASE = "https://users.lucid.app"`, `DOCS_BASE = "https://documents.lucid.app"`, and `DOCLIST_BASE = "https://userdocslist.lucid.app"`.
- Register all 14 T1-ready read slugs as `tier: "T1a"`, `origin: LUCID_ORIGIN`, `sideEffectClass: "read"`, with params copied from the existing descriptor JSON.
- Build every network operation as a bound spec sent through `ctx.executeBoundSpec`; never call direct `fetch`, `XMLHttpRequest`, `chrome.scripting`, `chrome.tabs`, `chrome.cookies`, `chrome.webRequest`, `document.cookie`, `localStorage`, or `sessionStorage`.
- Do not set `Authorization`, `Bearer`, or raw `Cookie` headers. Use browser-attached first-party cookies only through `authStrategy: "same-origin-cookie"` with `origin: LUCID_ORIGIN`.
- Add a read-only bootstrap helper that obtains `userId` and `accountId` through reviewed bound reads from the Lucid web app or Lucid first-party API response shape. If both IDs cannot be derived, return dual-field `RECIPE_DOM_FALLBACK_PENDING` before calling any ID-dependent spec. Do not scrape cookies directly.
- Implement these read mappings from the vendored Lucid source:
  - `get_current_user`: GET `https://users.lucid.app/users/{userId}`
  - `get_account`: GET `https://users.lucid.app/accounts/{accountId}`
  - `get_user_permissions`: GET `https://users.lucid.app/users/{userId}/permissions`
  - `list_account_users`: GET `https://users.lucid.app/accounts/{accountId}/userList`
  - `list_groups`: GET `https://users.lucid.app/groups?userId={userId}`
  - `list_documents`: GET `https://documents.lucid.app/users/{userId}/documents/{product || "chart"}` with optional `search`
  - `get_document_count`: GET `https://documents.lucid.app/users/{userId}/documents/{product || "chart"}/count`
  - `get_document`: GET `https://documents.lucid.app/documents/{document_id}`
  - `get_document_pages`: GET `https://documents.lucid.app/documents/{document_id}/pages`
  - `get_document_role`: GET `https://documents.lucid.app/documents/{document_id}/role`
  - `get_document_status`: GET `https://documents.lucid.app/documents/{document_id}/status`
  - `list_folder_entries`: GET `https://documents.lucid.app/users/{userId}/folderEntries/chart` with optional `parent`
  - `get_folder_entry`: GET `https://documents.lucid.app/users/{userId}/folderEntries/{entry_id}`
  - `search_documents`: GET `https://userdocslist.lucid.app/users/{userId}/documentList` with `search`, `count || 20`, and optional `product`
- Shape-check responses before returning success. Return `RECIPE_DOM_FALLBACK_PENDING` with `fellBackToDom: true` on missing `ctx.executeBoundSpec`, redirects, 401/403, HTTP errors, non-object/non-array shapes, or missing required fields.
- Register the six mutation slugs as guarded T1a entries that return `RECIPE_DOM_FALLBACK_PENDING` and never call `ctx.executeBoundSpec`.
- Add guarded write activation evidence rows for the six mutation slugs with status `guarded-fail-closed`, noting required live mutation-body UAT evidence before activation.
- Copy `catalog/handlers/lucid.js` byte-for-byte to `extension/catalog/handlers/lucid.js`.
- Extend `tests/capability-head-handlers.test.js` with Lucid fixture responses and assertions for exported read slugs, guarded mutation slugs, exact origin/base URLs, bootstrap fallback, spec construction, response guards, source banned-token checks, and extension-copy parity.
- Extend `tests/guarded-write-failclosed.test.js` for the six guarded Lucid mutation slugs.

Verify:
- `node -c catalog/handlers/lucid.js`
- `node -c extension/catalog/handlers/lucid.js`
- `cmp catalog/handlers/lucid.js extension/catalog/handlers/lucid.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/write-activation-evidence.test.js`

Done:
- `FsbHandlerLucid` exists in both handler roots, exports all 14 Lucid reads, registers all six Lucid mutations as inert guarded rows, and passes focused handler/evidence tests without direct credential scraping.

### 2. Wire Lucid through runtime, readiness, and origin gates

Files:
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `tests/head-handler-upgrade.test.js`
- `tests/head-handler-cap.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`
- `tests/verify-origin-classification.test.js`
- `tests/lattice-provider-bridge-smoke.test.js`

Action:
- Add `importScripts('catalog/handlers/lucid.js')` after the existing handler imports in `extension/background.js`.
- Add `{ global: 'FsbHandlerLucid', service: 'lucid.app', origin: 'https://lucid.app' }` to `HEAD_HANDLER_MODULES` without removing any existing dirty-tree handlers.
- Update `tests/head-handler-cap.test.js` from the current exact head set to include `FsbHandlerLucid` and increase the exact count/cap from 38 to 39.
- Update `tests/lattice-provider-bridge-smoke.test.js` importScripts token and call-site counts by +1 over the current Chipotle-inclusive baseline.
- Add `lucid.js` to handler module lists in readiness reporting, coverage reporting, T1 port contract verification, and recipe-path allowlisting.
- Add `lucid: 'lucid.js'` to `HANDLER_BY_APP` in `scripts/verify-t1-port-contract.mjs`.
- Add the 14 read slugs to `T1_READY_SLUGS` and the six mutation slugs to guarded fail-closed readiness sets in `extension/utils/capability-search.js` and `scripts/report-t1-readiness.mjs`.
- Add `FsbHandlerLucid` to `scripts/verify-origin-classification.mjs` with a Lucid-specific first-party same-site auth read mapping for exactly these API bases: `https://users.lucid.app`, `https://documents.lucid.app`, and `https://userdocslist.lucid.app`.
- Implement the Lucid origin proof so it passes only when all of these are true:
  - `vendor/opentabs-snapshot/plugins/lucid/src/lucid-api.ts` still declares the three exact Lucid API bases above.
  - the 14 selected vendored read tool files contain the expected read paths listed in Task 1.
  - `catalog/handlers/lucid.js` contains `FsbHandlerLucid`, all 14 read slugs, all six guarded slugs, and the three exact Lucid API bases.
  - guarded mutation handlers do not call `ctx.executeBoundSpec`.
  - handler source contains no direct fetch/XHR, extension credential APIs, direct cookie reads, storage reads, `Authorization`, `Bearer`, generic `csrfSource`, or non-Lucid API base.
- Route that proof through an explicit same-registrable-domain authenticated first-party read classification reason such as `SAME_REGISTRABLE_DOMAIN_FIRST_PARTY_AUTH_READ`. Do not reuse the no-auth public CORS path used by Bluesky/Chipotle.
- Extend `tests/verify-origin-classification.test.js` with positive Lucid assertions and negative controls for an evil base, direct cookie read, storage read, bearer header, and mutation handler calling `executeBoundSpec`.
- Extend `tests/head-handler-upgrade.test.js` with all 20 Lucid rows: 14 reads without `expectWrite`, six guarded mutations with `expectWrite: true`.
- Extend `tests/t1-readiness-report.test.js` and `tests/t1-terminal-states.test.js` so Lucid reads are `t1-ready` and Lucid mutations are `t1-guarded-fail-closed`.

Verify:
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/verify-origin-classification.test.js`
- `node tests/lattice-provider-bridge-smoke.test.js`

Done:
- Lucid is registered as a reviewed head handler, search/readiness surfaces expose the correct ready/guarded split, and origin classification proves the Lucid-specific first-party same-site API boundary without broadening generic cross-origin execution.

### 3. Refresh generated readiness artifacts and run targeted validation

Files:
- `extension/catalog/recipe-index.generated.js`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.json`
- `.planning/phases/44-t1-readiness-inventory-status-surface/44-T1-READINESS.md`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.json`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TAIL-WORKLIST.md`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.json`
- `.planning/phases/51-full-t1-tail-migration-across-remaining-catalog/51-T1-TERMINAL-STATES.md`
- `.planning/quick/260630-qjb-make-this-app-lucid-t1-ready/260630-qjb-SUMMARY.md`
- `.planning/STATE.md`

Action:
- Run the existing catalog/package generation command used by recent T1 quick tasks if handler copy or generated catalog drift requires it; do not hand-edit generated descriptor data.
- Regenerate Phase 44 readiness and Phase 51 tail/terminal-state reports through the existing scripts, preserving unrelated dirty rows.
- Confirm Lucid's 20 descriptors move from the tail into 14 ready rows and six guarded rows.
- Create `260630-qjb-SUMMARY.md` with commands run, Lucid ready/guarded counts, and any unrelated dirty-work gate failures if broad validation is blocked.
- Update `.planning/STATE.md` only for the quick-task completion row; do not rewrite unrelated project state.

Verify:
- `node scripts/report-t1-readiness.mjs`
- `node scripts/report-t1-terminal-states.mjs`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `npm run validate:extension`

Done:
- Generated readiness artifacts include Lucid's intended ready/guarded split, targeted gates are green, and any broader gate limitation is documented without touching unrelated existing dirty work.

## Overall Verification

Run the focused gate set before closing:

- `node -c catalog/handlers/lucid.js`
- `node -c extension/catalog/handlers/lucid.js`
- `cmp catalog/handlers/lucid.js extension/catalog/handlers/lucid.js`
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/write-activation-evidence.test.js`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `npm run validate:extension`

## Success Criteria

- `lucid.js` exists under both handler roots and the two files are byte-identical.
- All 14 Lucid read slugs resolve through `FsbHandlerLucid` as T1a read handlers.
- All six Lucid mutation slugs are guarded fail-closed and inert.
- Lucid readiness/search/reporting rows show 14 `t1-ready` and six `t1-guarded-fail-closed`.
- Origin classification has a Lucid-specific same-site first-party proof and negative controls for unsafe broadening.
- No unrelated existing dirty work is reverted or rewritten.
