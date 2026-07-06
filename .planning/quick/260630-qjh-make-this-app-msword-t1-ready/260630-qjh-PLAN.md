---
quick: 260630-qjh
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - catalog/handlers/msword.js
  - extension/catalog/handlers/msword.js
  - catalog/descriptors/opentabs__msword__append_to_document.json
  - extension/background.js
  - extension/utils/capability-catalog.js
  - extension/utils/capability-search.js
  - scripts/report-t1-readiness.mjs
  - scripts/coverage-report.mjs
  - scripts/verify-origin-classification.mjs
  - scripts/verify-recipe-path-guard.mjs
  - scripts/verify-t1-port-contract.mjs
  - catalog/write-activation-evidence.json
  - tests/capability-head-handlers.test.js
  - tests/head-handler-upgrade.test.js
  - tests/head-handler-cap.test.js
  - tests/guarded-write-failclosed.test.js
  - tests/t1-readiness-report.test.js
  - tests/t1-terminal-states.test.js
  - tests/verify-origin-classification.test.js
requirements:
  - QT-260630-qjh
user_setup: []
---

# Quick 260630-qjh Plan: MS Word T1 Readiness

## Objective

Make MS Word T1-ready under the current T1 posture: promote safe Word Online / Microsoft Graph reads to handler-backed T1a, and keep document/file mutations guarded fail-closed until live mutation-body UAT proves exact request safety.

## Scope

- T1-ready reads: `msword.get_active_document`, `msword.get_current_user`, `msword.get_document_text`, `msword.get_drive`, `msword.get_file_content`, `msword.get_item`, `msword.list_children`, `msword.list_permissions`, `msword.list_recent_documents`, `msword.list_shared_with_me`, `msword.list_versions`, `msword.search_files`.
- Guarded fail-closed rows: `msword.append_to_document`, `msword.copy_item`, `msword.create_document`, `msword.create_folder`, `msword.create_sharing_link`, `msword.delete_item`, `msword.delete_permission`, `msword.get_preview_url`, `msword.move_item`, `msword.rename_item`, `msword.replace_text_in_document`, `msword.restore_version`, `msword.update_document`, `msword.update_file_content`, `msword.upload_file`.
- `msword.append_to_document` is currently read-classified but semantically mutates a document; correct it to `sideEffectClass: "write"` and treat it as guarded fail-closed.

## Execution Note

This worktree has many unrelated dirty T1 changes in shared files. If any planned shared file is already dirty when executing, do not make an atomic commit for this quick task; preserve the user's/shared changes and record the dirty-state caveat in the summary.

## Tasks

### 1. Add the MS Word handler

Files:
- `catalog/handlers/msword.js`
- `extension/catalog/handlers/msword.js`
- `catalog/descriptors/opentabs__msword__append_to_document.json`

Action:
- Create `FsbHandlerMsword` as a dual IIFE/CommonJS handler pinned to `https://word.cloud.microsoft`.
- Implement the safe read slugs as T1a handlers that use the active Word Online session to obtain same-origin Graph token context and perform bounded Microsoft Graph GET reads through `ctx.executeBoundSpec`; do not call direct `fetch`, `XMLHttpRequest`, `chrome.*`, storage APIs, cookie APIs, or log tokens.
- Use explicit Graph endpoint mappings for current user, drive, item metadata, children, permissions, recent/shared files, versions, search, file content, active document metadata, and document text. Return dual-field `RECIPE_DOM_FALLBACK_PENDING` on missing auth context, missing `executeBoundSpec`, redirects, 401/403, HTTP errors, or response shape mismatch.
- Register guarded fail-closed handler entries for all mutation/destructive rows listed above. Guarded handlers return `RECIPE_DOM_FALLBACK_PENDING` and never call `ctx.executeBoundSpec`.
- Change `msword.append_to_document` to `sideEffectClass: "write"` before registering it as guarded.
- Copy `catalog/handlers/msword.js` byte-for-byte to `extension/catalog/handlers/msword.js`.

Verify:
- `node -c catalog/handlers/msword.js`
- `node -c extension/catalog/handlers/msword.js`
- `cmp catalog/handlers/msword.js extension/catalog/handlers/msword.js`
- `node tests/capability-head-handlers.test.js`

Done:
- MS Word exports exactly the safe read rows as executable T1a and all write/destructive rows as inert guarded handlers.

### 2. Wire MS Word through T1 registries and gates

Files:
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/coverage-report.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `catalog/write-activation-evidence.json`

Action:
- Add `catalog/handlers/msword.js` to service-worker imports and `FsbHandlerMsword` to `HEAD_HANDLER_MODULES`.
- Add `msword.js` to readiness, coverage, recipe-path, origin-classification, and T1 port-contract handler maps.
- Add the safe read slugs to `T1_READY_SLUGS`; add all guarded rows to guarded fail-closed readiness sets.
- Add write-activation evidence records for guarded MS Word mutations/destructive rows requiring method/path/body, token scope, CSRF/ETag/concurrency, redaction, and live load-smoke proof before activation.
- Keep MS Word off any per-app MCP surface; only the generic capability tools may surface it.

Verify:
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `node scripts/report-t1-readiness.mjs`

Done:
- Search/readiness/coverage/port/origin gates show MS Word reads as `t1-ready` and guarded mutations as `t1-guarded-fail-closed`.

### 3. Add focused regression coverage

Files:
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/head-handler-cap.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-readiness-report.test.js`
- `tests/t1-terminal-states.test.js`
- `tests/verify-origin-classification.test.js`

Action:
- Add MS Word handler tests for export shape, origin pinning, Graph token/spec construction, Graph GET endpoint selection, response shape guards, fallback behavior, extension-copy parity, and banned direct credential/network access.
- Extend upgrade rows so the safe read slugs resolve as T1a handler-backed entries and guarded rows resolve without active execution.
- Extend guarded-write tests so every MS Word mutation/destructive row, including corrected `append_to_document`, returns fail-closed and never calls `ctx.executeBoundSpec`.
- Update head-count/cap tests, readiness assertions, terminal-state/search override coverage, and origin-classification tests.

Verify:
- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-upgrade.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/guarded-write-failclosed.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node tests/verify-origin-classification.test.js`

Done:
- Tests prevent MS Word from regressing to discovery-pending reads or active unguarded writes.

## Success Criteria

- MS Word safe reads route through `FsbHandlerMsword` with T1a handler proof.
- MS Word write/destructive rows are visible as guarded fail-closed, with no mutation path active.
- Readiness, coverage, port-contract, origin, cap, search, and guarded-write gates all recognize the intended split.
