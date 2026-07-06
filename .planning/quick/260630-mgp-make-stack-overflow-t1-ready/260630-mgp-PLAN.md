---
quick_id: 260630-mgp
slug: make-stack-overflow-t1-ready
description: Make Stack Overflow T1-ready
status: complete
created_at: 2026-06-30
completed_at: 2026-06-30
---

# Plan

Promote the safe Stack Overflow public read surface to T1-ready without replaying the separate Stack Exchange API or activating authenticated/user/comment endpoints.

## Scope

- Add a bundled T1a handler pinned to `https://stackoverflow.com` for public question, answer, search/list, and tag HTML reads.
- Keep user/profile/comment/API-dependent rows unregistered until a reviewed same-origin or bridge path exists.
- Wire `FsbHandlerStackoverflow` through service-worker imports, the head manifest, readiness/search overrides, origin classification, recipe-path, port-contract, coverage, and upgrade tests.
- Add focused handler tests for URL construction, public HTML parsing, inactive rows, extension-copy parity, and fail-closed human-verification handling.

## Verification

- Syntax and extension-copy parity for `catalog/handlers/stackoverflow.js`.
- Head-handler behavior coverage in `tests/capability-head-handlers.test.js`.
- Head cap and dom-to-T1a upgrade coverage.
- Origin classification and recipe-path guard coverage.
- T1 readiness report regeneration.
