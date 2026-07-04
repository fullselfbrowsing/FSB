---
quick_id: 260701-2mc
slug: implement-zendesk-to-be-t1-ready
status: completed
date: 2026-07-01
commit: working-tree
---

# Quick Task 260701-2mc Summary: Implement Zendesk to be T1 ready

## Summary

Implemented Zendesk as a T1a handler-backed app. Zendesk reads now use bounded same-origin `GET /api/v2` calls through `ctx.executeBoundSpec`, with active tenant-origin binding for `*.zendesk.com` pages. Zendesk write/destructive capabilities stay guarded fail-closed until mutation-body UAT exists.

Readiness now reports:

- 13 Zendesk read rows as `t1-ready`
- 4 Zendesk mutation rows as `t1-guarded-fail-closed`

## Files Changed

- `catalog/handlers/zendesk.js`
- `extension/catalog/handlers/zendesk.js`
- `extension/background.js`
- `extension/utils/capability-catalog.js`
- `scripts/report-t1-readiness.mjs`
- `scripts/verify-t1-port-contract.mjs`
- `scripts/verify-origin-classification.mjs`
- `scripts/verify-recipe-path-guard.mjs`
- `tests/capability-head-handlers.test.js`
- `tests/head-handler-upgrade.test.js`
- `tests/guarded-write-failclosed.test.js`
- `tests/t1-readiness-report.test.js`

## Verification

- `node -c catalog/handlers/zendesk.js && node -c extension/catalog/handlers/zendesk.js` - pass
- `cmp -s catalog/handlers/zendesk.js extension/catalog/handlers/zendesk.js` - pass
- Focused readiness check for `zendesk.*` - pass, 13 `t1-ready`, 4 `t1-guarded-fail-closed`
- `node tests/t1-readiness-report.test.js` - pass, 30 passed / 0 failed
- `node tests/head-handler-upgrade.test.js` - pass, 5268 passed / 0 failed
- `node tests/guarded-write-failclosed.test.js` - pass, 1736 passed / 0 failed
- `node tests/capability-head-handlers.test.js` - Zendesk assertions pass; command fails on 2 unrelated concurrent assertions:
  - `homedepot.get_store_context reads the first-party bootstrap page`
  - `sentry.get_event extracts org from sentry.io subdomain and preserves the active origin`
- `node scripts/verify-t1-port-contract.mjs` - no Zendesk failures; command fails on unrelated PostHog verifier mapping/guarded entries, Tinder side-effect class, and TikTok/Tinder guarded-row classification issues
- `node scripts/verify-origin-classification.mjs` - Zendesk passes as `SAME-ORIGIN`; command fails on unrelated unmapped/mismatched heads
- `node scripts/verify-recipe-path-guard.mjs` - Zendesk added to allowlist; command fails on unrelated allowlist drift for other handler files

## Remaining Risks

- Live Zendesk tenant UAT is still needed to confirm production `/api/v2` response shapes across customer subdomains.
- Zendesk mutations intentionally remain guarded fail-closed until body/CSRF semantics are reviewed and live UAT is recorded.
- No atomic commit was created because the worktree and index already contain extensive concurrent, unrelated T1 work, including unrelated staged files; committing from this state would risk capturing another worker's changes.
