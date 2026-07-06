---
quick_id: 260630-vq5
slug: make-this-app-coinbase-t1-ready
status: completed
---

# Make Coinbase T1-ready

## Scope

Promote the Coinbase catalog stem into the current T1 model:

- Safe read descriptors resolve to a bundled T1a handler pinned to Coinbase's first-party web origin.
- Coinbase GraphQL mutations remain explicit guarded fail-closed rows until live mutation-body UAT exists.
- Readiness, origin-classification, recipe-path, search labels, and handler upgrade tests recognize Coinbase.

## Plan

1. Add `catalog/handlers/coinbase.js` and the unpacked extension copy with closed schemas, same-origin `/graphql/query` read specs, GraphQL shape guards, and inert guarded mutation handlers.
2. Register Coinbase in the head module lists, background import list, readiness/coverage loaders, origin-classification map, and T1 port contract map.
3. Add guarded write evidence rows and focused tests for Coinbase read/guarded behavior.
4. Regenerate the packaged catalog snapshot and run focused T1 gates.
