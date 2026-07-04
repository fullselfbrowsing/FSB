---
quick_id: 260701-2md
slug: make-mastodon-t1-ready
status: complete
completed: 2026-07-01
commit: working-tree
---

# Quick Task 260701-2md: Make Mastodon T1 Ready

## Summary

Mastodon now resolves through a bundled T1a handler:

- `mastodon.get_status` and `mastodon.list_timeline` report `t1-ready` with handler proof.
- `mastodon.create_status` and `mastodon.delete_status` report `t1-guarded-fail-closed`, return `RECIPE_DOM_FALLBACK_PENDING`, and do not call `executeBoundSpec`.

## Verification

- `node --check catalog/handlers/mastodon.js`
- `node --check extension/catalog/handlers/mastodon.js`
- Mastodon read-handler probe: generated same-origin-cookie GET specs for `/api/v1/statuses/123` and `/api/v1/timelines/home?max_id=999&limit=2`.
- Mastodon readiness probe via `reportReadiness`: 4/4 Mastodon rows in expected terminal states.
- Mastodon guarded-write probe: both guarded writes returned dual-field fallback with 0 `executeBoundSpec` calls.
- Mastodon-only origin classification: same-origin `https://mastodon.social/api/v1`, 0 failures.
- Mastodon-only port-contract validation: 0 failures.
- Mastodon-only write-activation-evidence validation: 0 failures, 2 guarded records.

## Broad Gate Notes

Several broad gates fail on unrelated parallel worktree state, not on Mastodon:

- `node tests/head-handler-cap.test.js`: current manifest has 109 heads against cap/exact count 106.
- `node tests/guarded-write-failclosed.test.js`: aborts on a syntax error in `catalog/handlers/aws.js`.
- `node tests/t1-readiness-report.test.js`: fails on AWS rows retaining non-discovery T3 states.
- `node scripts/verify-t1-port-contract.mjs`, `node scripts/verify-origin-classification.mjs`, and `node scripts/verify-write-activation-evidence.mjs`: fail on other apps' unmapped heads/evidence/handler issues.
