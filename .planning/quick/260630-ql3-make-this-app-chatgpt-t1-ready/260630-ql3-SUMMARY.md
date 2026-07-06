---
quick_id: 260630-ql3
slug: make-this-app-chatgpt-t1-ready
status: completed
completed: 2026-07-01
commit: working-tree
---

# Quick Task 260630-ql3 Summary: Make ChatGPT T1-ready

## Outcome

ChatGPT now has a bundled T1a read handler for the reviewed same-origin `chatgpt.com/backend-api` surface. The handler is registered in the canonical catalog and extension copy, loaded by the service worker, recognized by readiness/coverage/port-contract/origin gates, and surfaced as T1-ready in capability search.

Promoted read slugs:

- `chatgpt.discover_gpts`
- `chatgpt.get_account_info`
- `chatgpt.get_beta_features`
- `chatgpt.get_conversation`
- `chatgpt.get_current_user`
- `chatgpt.get_custom_instructions`
- `chatgpt.get_gpt`
- `chatgpt.get_memories`
- `chatgpt.get_prompt_library`
- `chatgpt.list_conversations`
- `chatgpt.list_models`
- `chatgpt.list_shared_conversations`
- `chatgpt.search_conversations`

Kept out of the executable head:

- `chatgpt.archive_conversation`
- `chatgpt.delete_conversation`
- `chatgpt.rename_conversation`
- `chatgpt.star_conversation`
- `chatgpt.unarchive_conversation`
- `chatgpt.unstar_conversation`
- `chatgpt.update_custom_instructions`

## Implementation Notes

- Added `FsbHandlerChatgpt` in `catalog/handlers/chatgpt.js` and copied it byte-for-byte to `extension/catalog/handlers/chatgpt.js`.
- The handler uses only `ctx.executeBoundSpec`: first a pinned same-origin GET to `https://chatgpt.com/api/auth/session`, then pinned GET requests to `https://chatgpt.com/backend-api/...` with the session access token inside the bound spec.
- The handler has no direct network calls, no extension credential/navigation APIs, and no token logging.
- Registered `FsbHandlerChatgpt` in `extension/utils/capability-catalog.js`, loaded it from `extension/background.js`, and added ChatGPT to readiness, coverage, port-contract, origin-classification, recipe-path guard, upgrade, head-cap, search-readiness, and report tests.
- Regenerated the T1 readiness report and extension package artifacts.

## Verification

Passed:

- `node -c catalog/handlers/chatgpt.js`
- `node -c extension/catalog/handlers/chatgpt.js`
- `cmp catalog/handlers/chatgpt.js extension/catalog/handlers/chatgpt.js`
- `node tests/capability-head-handlers.test.js` -> 909 passed, 0 failed
- `node tests/head-handler-upgrade.test.js` -> 2589 passed, 0 failed
- `node tests/head-handler-cap.test.js` -> 5 passed, 0 failed
- `node tests/lattice-provider-bridge-smoke.test.js` -> 101 passed, 0 failed
- `node tests/t1-readiness-report.test.js` -> 14 passed, 0 failed
- `node scripts/report-t1-readiness.mjs` -> 2314 descriptors, 545 ready, 172 guarded, 1403 discovery, 194 blocked
- `node scripts/report-t1-tail-worklist.mjs` -> 1597 tail rows, 1403 actionable, 194 blocked
- `node scripts/report-t1-terminal-states.mjs` -> 2314 descriptors, 545 ready, 316 bridge-needed, 485 write/destructive rows need live UAT
- `node scripts/verify-t1-readiness-gate.mjs`
- `node scripts/verify-recipe-path-guard.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- `npm run package:extension`

Known unrelated workspace blockers:

- `node scripts/verify-origin-classification.mjs` and `node tests/verify-origin-classification.test.js` still fail on unmapped Snowflake, Discord, and PowerPoint heads. ChatGPT classifies same-origin in both outputs.
- `node tests/t1-terminal-states.test.js` still fails because Hack2Hire, PowerPoint, and Snowflake handler-backed rows are missing from the shared search readiness override. ChatGPT is no longer listed among the missing overrides.
- `npm run validate:extension` reaches `verify-origin-classification.mjs` and stops on the same Snowflake, Discord, and PowerPoint blockers.

No commit was created because this Conductor workspace already contains many unrelated uncommitted quick-task changes.
