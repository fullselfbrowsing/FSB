---
quick_id: 260701-e6d
status: implemented
mode: quick
description: Implement this Microsoft Teams to be T1 ready
completed: 2026-07-01
commit_status: blocked-shared-index
---

# Quick Task 260701-e6d Summary

## T1-Ready Meaning For Microsoft Teams

Microsoft Teams is T1-ready in this repo when every Teams catalog row has an explicit terminal state instead of falling through the DOM/discovery tail:

- Read-only Teams rows are T1a handler-backed, pinned to `https://teams.live.com`, and route through bounded primitives.
- Teams reads use page-realm auth context only to recover Microsoft Graph bearer tokens already present in the logged-in Teams page, then execute GET-only bound specs against `https://graph.microsoft.com/v1.0`.
- Mutation-capable Teams rows are handler-backed but guarded fail-closed with write-activation evidence until live write UAT proves safe mutation bodies and consent/audit behavior.
- Search, readiness, origin classification, path guard, and write-evidence surfaces all classify Teams consistently.

## Implemented

- Added canonical and extension Teams handlers for:
  - `teams.get_current_user`
  - `teams.list_conversations`
  - `teams.get_conversation_details`
  - `teams.read_messages`
  - `teams.create_chat`
  - `teams.delete_message`
  - `teams.edit_message`
  - `teams.invite_to_channel`
  - `teams.remove_member`
  - `teams.send_message`
  - `teams.set_channel_topic`
- Added Teams page-read auth context in `capability-fetch.js`.
- Wired the Teams handler into service-worker import and head-handler registration.
- Added Teams readiness overrides, guarded-write evidence records, path-guard allowlist coverage, and origin-classification support.
- Corrected `teams.invite_to_channel` from read to write-classified because it adds a member.
- Added a focused Teams regression test covering handler shape, bounded read flow, fail-closed writes, search/readiness state, and evidence coverage.

## Files Carrying Local Teams Task Changes

- `.planning/quick/260701-e6d-implement-this-microsoft-teams-to-be-t1-/260701-e6d-PLAN.md`
- `.planning/quick/260701-e6d-implement-this-microsoft-teams-to-be-t1-/260701-e6d-SUMMARY.md`
- `catalog/handlers/teams.js`
- `extension/catalog/handlers/teams.js`
- `catalog/descriptors/opentabs__teams__invite_to_channel.json`
- `catalog/descriptors/_fixtures/seed-descriptors.json`
- `extension/catalog/recipe-index.generated.js`
- `tests/teams-t1-ready.test.js`
- `tests/write-activation-evidence.test.js`

## Shared Wiring Already Present In Current HEAD And Verified

- `.planning/STATE.md` includes the Teams quick-task row after a concurrent docs commit advanced the branch.
- `extension/background.js`
- `extension/utils/capability-fetch.js`
- `extension/utils/capability-catalog.js`
- `extension/utils/capability-search.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `catalog/write-activation-evidence.json`

## Verification

- PASS: `node tests/teams-t1-ready.test.js` -> 14 passed, 0 failed.
- PASS: `node scripts/verify-write-activation-evidence.mjs` -> 5 active write records; 549 guarded fail-closed records; 0 unrecorded write activations.
- PASS: `node tests/write-activation-evidence.test.js` -> 9 passed, 0 failed.
- PASS: `node tests/t1-readiness-report.test.js` -> 34 passed, 0 failed.
- PASS: `node --check scripts/report-t1-readiness.mjs`.
- PASS: `node --check scripts/verify-origin-classification.mjs`.
- PASS: `node --check extension/utils/capability-fetch.js && node --check extension/utils/capability-catalog.js && node --check catalog/handlers/teams.js`.
- PASS: `node --import tsx scripts/verify-no-orphan-descriptor.mjs` -> 2306 committed opentabs descriptors matched the importer output; 0 orphans.
- PASS: `node scripts/verify-t1-readiness-gate.mjs` -> 2314 rows; 1267 ready; 556 guarded fail-closed.
- PASS: Teams readiness spot check -> 4 Teams reads `t1-ready:T1a:handler`; 7 Teams mutations `t1-guarded-fail-closed:T1a:handler`.
- FAIL, unrelated to Teams: `node scripts/verify-origin-classification.mjs` still reports unmapped adjacent app heads, but Teams classifies as `PAGE-BEARER-GRAPH FsbHandlerTeams head=https://teams.live.com api=https://graph.microsoft.com/v1.0`.
- FAIL, unrelated to Teams: `node scripts/verify-recipe-path-guard.mjs` still reports allowlist drift for adjacent app handlers, not Teams.
- FAIL, unrelated to Teams: `node tests/t1-terminal-states.test.js` still reports adjacent search override and Supabase terminal-state drift, not Teams.
- FAIL, unrelated to Teams: `node scripts/verify-catalog-crosscheck.mjs` still reports payment-op issues for Etsy/Lyft, not Teams.

## Commit Status

No clean commit was made from this shared checkout. The worktree already had unrelated staged and unstaged changes in overlapping generated/seed/test files (`catalog/descriptors/_fixtures/seed-descriptors.json`, `extension/catalog/recipe-index.generated.js`, `tests/write-activation-evidence.test.js`, and others). Committing now would either include other agents' changes or rewrite their staged index entries.

Next concrete action: after adjacent agents land or clear the overlapping staged changes, stage only the Teams files listed above and commit the task atomically.
