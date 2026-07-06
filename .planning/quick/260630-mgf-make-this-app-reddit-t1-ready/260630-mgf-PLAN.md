---
quick_id: 260630-mgf
slug: make-this-app-reddit-t1-ready
description: Make this app reddit T1-ready
status: complete
created_at: 2026-06-30T21:10:07.606Z
completed_at: 2026-06-30T21:25:31Z
---

# Plan

Promote Reddit's safe same-origin GET read surface to T1-ready while keeping mutation and OAuth/bearer-token operations out of the active head.

## Scope

- Add a Reddit T1a handler pinned to `https://www.reddit.com` for the 13 vendored GET-only reads: `get_me`, post/comment/subreddit/user reads, post/subreddit searches, flair/popular/subscription/user-content/inbox listings.
- Do not activate `hide`, `save`, `report`, `submit_*`, `subscribe`, `vote`, `edit_text`, `delete`, or `send_message`; those use POST, modhash, or OAuth bearer flows and need write/UAT handling.
- Wire `FsbHandlerReddit` through the bundled head manifest, service-worker imports, readiness reporting, coverage, origin-classification, recipe-path, port-contract, and search readiness override.
- Regenerate T1 readiness, tail, and terminal-state reports.

## Verification

- Focused Reddit handler behavior tests for URL construction, same-origin bound specs, response shape guards, and inactive mutation rows.
- Head manifest, origin-classification, upgrade, T1 readiness, tail, terminal-state, recipe-path, and port-contract gates.
- `npm run validate:extension` if the focused gates pass.
