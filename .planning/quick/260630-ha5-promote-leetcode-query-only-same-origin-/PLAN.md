---
quick_id: 260630-ha5
slug: promote-leetcode-query-only-same-origin-
description: Promote LeetCode query-only same-origin reads to T1-ready
status: complete
created_at: 2026-06-30T17:26:34.075Z
---

# Plan

Promote a narrow, proof-backed LeetCode same-origin read batch from the Phase 51 tail to T1-ready.

## Scope

- Add a LeetCode T1a handler for query-only GraphQL descriptors on `https://leetcode.com/graphql/`.
- Keep `leetcode.run_code` and `leetcode.submit_code` inactive in this quick task because they execute/submit user code despite the imported descriptor class.
- Wire the handler through the bundled head manifest, package copy, readiness reporting, port contract, recipe-path guard, origin-classification gate, and search readiness override.
- Regenerate T1 reports and validate the extension.

## Verification

- Focused handler behavior tests.
- Head manifest and origin-classification tests.
- T1 readiness, tail, terminal-state, and port-contract gates.
- Full `npm run validate:extension`.
