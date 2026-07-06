---
quick_id: 260701-2lo
slug: implement-craigslist-to-be-t1-ready
description: Implement Craigslist to be T1 ready
status: complete
completed: 2026-07-01
commit: working-tree
---

# Quick Task 260701-2lo Summary

## Outcome

Implemented a Craigslist T1 handler and the narrow shared wiring required for the existing Craigslist descriptors.

Read descriptors now resolve as `t1-ready` / `T1a`:

- `craigslist.get_current_user`
- `craigslist.get_saved_search_counts`
- `craigslist.list_renewable_postings`
- `craigslist.list_payment_cards`
- `craigslist.list_chat_conversations`
- `craigslist.get_chat_messages`

Mutation descriptors now resolve as `t1-guarded-fail-closed` / `T1a`:

- `craigslist.renew_all_postings`
- `craigslist.set_default_payment_card`
- `craigslist.delete_payment_card`

## Implementation Notes

- Added `catalog/handlers/craigslist.js` and mirrored it byte-for-byte to `extension/catalog/handlers/craigslist.js`.
- Reads use `ctx.executeBoundSpec` only, pinned to the Craigslist account origin while calling the reviewed first-party Craigslist web API hosts used by the vendored plugin.
- Mutations are registered but inert: they return `RECIPE_DOM_FALLBACK_PENDING` with named fail-closed reasons and do not call any execution primitive.
- Added Craigslist to background imports, head handler manifest, readiness guarded-write roster, origin classification, recipe-path guard, port-contract map, readiness tests, guarded-write tests, and write-activation evidence.

## Verification

Passed:

- `node -c catalog/handlers/craigslist.js && node -c extension/catalog/handlers/craigslist.js && cmp -s catalog/handlers/craigslist.js extension/catalog/handlers/craigslist.js`
- Inline Craigslist handler contract check for read/write registrations and guarded write no-execution behavior.
- Inline readiness report check: all six Craigslist reads are `t1-ready`; all three Craigslist mutations are `t1-guarded-fail-closed`.
- JSON parse check for `catalog/write-activation-evidence.json`.
- Inline evidence check for the three Craigslist guarded-write ledger rows.

Broad checks run with non-Craigslist failures from the shared worktree:

- `node tests/capability-head-handlers.test.js`: Craigslist block passed, then suite failed on unrelated Shopify/Airtable assertions and an AWS handler syntax error.
- `node tests/head-handler-upgrade.test.js`: failed on unrelated AWS handler syntax error.
- `node tests/guarded-write-failclosed.test.js`: Craigslist rows were included, then suite failed on unrelated AWS handler syntax error.
- `node tests/t1-readiness-report.test.js`: failed on unrelated AWS rows (`aws.invoke_function`, `aws.start_instance`, `aws.stop_instance`).
- `node tests/write-activation-evidence.test.js`: failed on unrelated missing evidence for many non-Craigslist guarded writes; Craigslist evidence was present.
- `node scripts/verify-origin-classification.mjs`: Craigslist classified without a Craigslist failure; script failed on unrelated unmapped/separate-origin heads.
- `node scripts/verify-recipe-path-guard.mjs`: failed on unrelated allowlist drift for non-Craigslist handlers.
- `node scripts/verify-t1-port-contract.mjs`: failed on unrelated PostHog/AWS/TikTok issues.

## Commit

Not committed. The repository has concurrent uncommitted edits in the same shared manifests and tests this task had to touch, so an atomic commit would capture other agents' changes.
