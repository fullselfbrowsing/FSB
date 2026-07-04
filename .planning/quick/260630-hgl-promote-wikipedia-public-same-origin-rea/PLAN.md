---
quick_id: 260630-hgl
slug: promote-wikipedia-public-same-origin-rea
description: Promote Wikipedia public same-origin reads to T1-ready
status: complete
created_at: 2026-06-30T17:34:19.130Z
---

# Plan

Promote a narrow, proof-backed Wikipedia public read batch from the Phase 51 tail to T1-ready.

## Scope

- Add a Wikipedia T1a handler for public MediaWiki `/w/api.php` and same-origin REST reads on `https://en.wikipedia.org`.
- Keep `wikipedia.get_current_user` inactive because its proof depends on page-global MediaWiki auth state.
- Keep `wikipedia.get_page_views` inactive because the vendored implementation calls `wikimedia.org`, not the active Wikipedia origin.
- Wire the handler through the bundled head manifest, package copy, readiness reporting, port contract, recipe-path guard, origin-classification gate, and search readiness override.
- Regenerate T1 reports and validate the extension.

## Verification

- Focused handler behavior tests.
- Head manifest and origin-classification tests.
- T1 readiness, tail, terminal-state, and port-contract gates.
- Full `npm run validate:extension`.
