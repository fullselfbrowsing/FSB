---
quick_id: 260630-k18
slug: promote-hacker-news-public-same-origin-h
description: Promote Hacker News public same-origin HTML reads to T1-ready
status: complete
created_at: 2026-06-30T19:25:29.998Z
---

# Plan

Promote the safe Hacker News public HTML read batch from the Phase 51 same-origin tail to T1-ready.

## Scope

- Add a Hacker News T1a handler for read-only HTML GETs on `https://news.ycombinator.com`.
- Activate only the 9 read-only slugs: item, comments, user, and story-list reads.
- Keep `hackernews.submit_comment` inactive because the vendored implementation posts an HMAC-backed form.
- Wire the handler through the bundled head manifest, service-worker imports, readiness reporting, coverage, origin-classification, recipe-path, port-contract, and search readiness override.
- Regenerate T1 readiness, tail, and terminal-state reports.

## Verification

- Focused handler behavior tests with HTML parser and fallback coverage.
- Head manifest, origin-classification, upgrade, T1 readiness, tail, terminal-state, recipe-path, and port-contract gates.
- Full `npm run validate:extension`.
