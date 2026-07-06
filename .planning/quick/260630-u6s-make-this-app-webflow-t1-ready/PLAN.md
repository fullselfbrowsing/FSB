---
status: complete
created: 2026-07-01T02:44:08Z
quick_id: 260630-u6s
slug: make-this-app-webflow-t1-ready
---

# Make this app Webflow T1-ready

## Scope

Promote the existing Webflow descriptors from DOM fallback to T1 handler-backed readiness by adding a same-origin read head for the vendored Webflow `/api` GET routes.

## Plan

1. Add `catalog/handlers/webflow.js` implementing all existing `webflow.*` read descriptors as `T1a` handlers pinned to `https://webflow.com`.
2. Copy the handler into `extension/catalog/handlers/webflow.js` for the shipped extension tree.
3. Register Webflow in `extension/background.js`, `extension/utils/capability-catalog.js`, the T1 readiness loader, and the T1 port verifier.
4. Mark all Webflow handler-backed slugs as T1-ready in the search readiness override.
5. Add focused handler/readiness assertions and run the relevant T1 tests.
