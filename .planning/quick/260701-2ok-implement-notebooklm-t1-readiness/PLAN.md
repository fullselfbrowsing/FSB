---
status: complete
quick_id: 260701-2ok
slug: implement-notebooklm-t1-readiness
date: 2026-07-01
---

# Quick Task 260701-2ok: Implement NotebookLM T1 Readiness

## Task 1: Add NotebookLM T1 Handler

Files:
- `catalog/handlers/notebooklm.js`
- `extension/catalog/handlers/notebooklm.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`

Action:
- Add a same-origin NotebookLM handler pinned to `https://notebooklm.google.com`.
- Promote read descriptors through reviewed batchexecute RPC specs.
- Keep all write/destructive descriptors fail-closed with byte-stable `RECIPE_DOM_FALLBACK_PENDING`.
- Return a proven URL for `navigate_to_notebook` without navigating the page.
- Wire the handler into the service-worker import list and head manifest.

Verify:
- Handler source uses no direct fetch/XHR, privileged browser credential APIs, or dynamic code.
- Read handlers call `ctx.executeBoundSpec` only with the NotebookLM origin.
- Guarded writes do not call any execution primitive.

## Task 2: Update T1 Gates

Files:
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `tests/head-handler-cap.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/capability-head-handlers.test.js`

Action:
- Add NotebookLM to the readiness module list, verifier app mapping, origin verifier, recipe path allowlist, head cap expectations, upgrade assertions, guarded write assertions, and head-handler behavioral tests.

Verify:
- Focused tests pass for NotebookLM handler behavior, head registration, guarded writes, and T1 port contract.

## Task 3: Correct Copy Side Effect And Validate

Files:
- `catalog/descriptors/opentabs__notebooklm__copy_notebook.json`
- `extension/catalog/recipe-index.generated.js`
- `catalog/descriptors/_fixtures/seed-descriptors.json`

Action:
- Correct `notebooklm.copy_notebook` from read to write in the shipped catalog surfaces because it creates a new notebook copy.

Verify:
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- Focused head-handler tests.
