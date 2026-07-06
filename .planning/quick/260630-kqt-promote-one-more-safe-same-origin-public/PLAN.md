---
quick_id: 260630-kqt
slug: promote-one-more-safe-same-origin-public
description: Promote Yelp public same-origin reads to T1-ready
status: complete
created_at: 2026-06-30T19:56:11.122Z
completed_at: 2026-06-30T20:03:44Z
---

# Plan

Promote the safe Yelp public same-origin read subset from the Phase 51 same-origin tail to T1-ready.

## Scope

- Add a Yelp T1a handler for public first-party reads on `https://www.yelp.com`.
- Activate only `yelp.autocomplete`, `yelp.get_business`, and `yelp.search_businesses`.
- Keep `yelp.get_current_user`, `yelp.get_current_page_businesses`, `yelp.navigate_to_business`, and `yelp.navigate_to_search` inactive because they depend on page globals or navigation semantics.
- Wire the handler through the bundled head manifest, service-worker imports, readiness reporting, coverage, origin-classification, recipe-path, port-contract, and search readiness override.
- Regenerate T1 readiness, tail, and terminal-state reports.

## Verification

- Focused handler behavior tests with Yelp HTML/JSON fixtures.
- Head manifest, origin-classification, upgrade, T1 readiness, tail, terminal-state, recipe-path, and port-contract gates.
- Full `npm run validate:extension`.
